#include <Windows.h>
#include <spdlog/spdlog.h>
#include <spdlog/sinks/basic_file_sink.h>
#include "Hooking.Patterns.h"
#include "Hooking.h"
#include <MinHook.h>
#include <unordered_map>
#include <string>
#include <optional>
#include <fstream>
#include <unordered_set>
#include <vector>
#include <algorithm>
#include <format>

#include "JsonWriter.h"

#if _DEBUG
static constexpr bool DefaultEnableLogging = true;
#else
static constexpr bool DefaultEnableLogging = true;
#endif

constexpr uint32_t joaat_literal(const char* text)
{
	if (!text)
	{
		return 0;
	}

	unsigned int hash = 0;
	while (*text)
	{
		hash += *text;
		hash += hash << 10;
		hash ^= hash >> 6;
		text++;
	}
	hash += hash << 3;
	hash ^= hash >> 11;
	hash += hash << 15;
	return hash;
}

static bool LoggingEnabled()
{
	static bool b = []()
	{
		char iniFilePath[MAX_PATH];
		GetFullPathName("DumpStructs.ini", MAX_PATH, iniFilePath, nullptr);
		int v = GetPrivateProfileInt("Config", "Log", 0, iniFilePath);
		return v != 0;
	}();
	return DefaultEnableLogging || b;
}

template<size_t BufferSize = 512>
static std::string Format(const char* format, ...)
{
	char buffer[BufferSize];
	va_list l;
	va_start(l, format);
	std::vsnprintf(buffer, BufferSize, format, l);
	va_end(l);
	return buffer;
}

static uint16_t GetGameBuild()
{
	const char* exeName = 
#if RDR2
		"RDR2.exe";
#else
		"GTA5.exe";
#endif

	std::string baseName = "dump";

	DWORD verHandle;
	DWORD verSize = GetFileVersionInfoSize(exeName, &verHandle);
	if (verSize != 0 && verHandle == 0)
	{
		std::vector<uint8_t> verData(verSize);
		if (GetFileVersionInfo(exeName, verHandle, verSize, verData.data()))
		{
			LPVOID buffer;
			UINT bufferLength;
			if (VerQueryValue(verData.data(), "\\", &buffer, &bufferLength) && bufferLength != 0)
			{
				VS_FIXEDFILEINFO* verInfo = reinterpret_cast<VS_FIXEDFILEINFO*>(buffer);

				if (verInfo->dwSignature == 0xFEEF04BD)
				{
					return (verInfo->dwFileVersionLS >> 16) & 0xFFFF;
				}
			}
		}
	}

	return 0xFFFF;
}

static std::unordered_map<uint32_t, std::string> gHashTranslation;
static void LoadHashes()
{
	std::ifstream f{ "dictionary.txt", std::ios::binary | std::ios::in  };

	auto add = [](std::string s) {
		const auto hash = joaat_literal(s.c_str());
		gHashTranslation.try_emplace(hash, std::move(s));
	};

	spdlog::info("Loading hashes...");
	int numLines = 0;
	std::string line;
	while (std::getline(f, line))
	{
		if (line.size() > 0 && line.back() == '\n') line.pop_back();
		if (line.size() > 0 && line.back() == '\r') line.pop_back();

		numLines++;

		add(line);

		if (line.size() > 0) {
			line[0] = std::tolower(line[0]);
			add(line);

			line[0] = std::toupper(line[0]);
			add(line);
		}

		std::transform(line.begin(), line.end(), line.begin(), [](char c) { return std::tolower(c); });
		add(line);

		std::transform(line.begin(), line.end(), line.begin(), [](char c) { return std::toupper(c); });
		add(line);
	}

	spdlog::info("	> {} lines, {} unique hashes", numLines, gHashTranslation.size());
}

static std::string HashToStr(uint32_t h)
{
	auto it = gHashTranslation.find(h);
	if (it != gHashTranslation.end())
	{
		return it->second;
	}
	else
	{
		return Format("_0x%08X", h);
	}
}

enum class parMemberType : uint8_t // 0x1CA39C3D
{
	BOOL = 0,
	CHAR = 1,
	UCHAR = 2,
	SHORT = 3,
	USHORT = 4,
	INT = 5,
	UINT = 6,
	FLOAT = 7,
	VECTOR2 = 8,
	VECTOR3 = 9,
	VECTOR4 = 10,
	STRING = 11,
	STRUCT = 12,
	ARRAY = 13,
	ENUM = 14,
	BITSET = 15,
	MAP = 16,
	MATRIX34 = 17,
	MATRIX44 = 18,
	VEC2V = 19,
	VEC3V = 20,
	VEC4V = 21,
	MAT33V = 22,
	MAT34V = 23,
	MAT44V = 24,
	SCALARV = 25,
	BOOLV = 26,
	VECBOOLV = 27,
	PTRDIFFT = 28,
	SIZET = 29,
	FLOAT16 = 30,
	INT64 = 31,
	UINT64 = 32,
	DOUBLE = 33,
#if RDR2
	GUID = 34,
	_0xFE5A582C = 35,
	QUATV = 36,
#endif
};

enum class parMemberCommonSubtype
{
	// these don't seem to be used while parsing, probably used by internal engine tools
	COLOR = 1, // used with UINT, VECTOR3 (RDR3)
#if RDR2
	ANGLE = 2, // used with FLOAT
#endif
};

enum class parMemberArraySubtype  // 0xADE25B1B
{
	ATARRAY = 0,                        // 0xABE40192
	ATFIXEDARRAY = 1,                   // 0x3A523E81
	ATRANGEARRAY = 2,                   // 0x18A25B6B
	POINTER = 3,                        // 0x47073D6E
	MEMBER = 4,                         // 0x6CC11BB4
	_0x2087BB00 = 5,                    // 0x2087BB00 - 32-bit atArray
	POINTER_WITH_COUNT = 6,             // 0xE2980EB5
	POINTER_WITH_COUNT_8BIT_IDX = 7,    // 0x254D33B1
	POINTER_WITH_COUNT_16BIT_IDX = 8,   // 0xB66B6752
	VIRTUAL = 9,                        // 0xAC01A1DC
};

enum class parMemberEnumSubtype  // 0x2721C60A
{
#if RDR2
	_64BIT = 0,
	_32BIT = 1,
	_16BIT = 2,
	_8BIT = 3,
#else
	_32BIT = 0,         // 0xAF085554
	_16BIT = 1,         // 0x0D502D8E
	_8BIT = 2,          // 0xF2AAF53D
#endif
};

enum class parMemberBitsetSubtype
{
#if RDR2
	_32BIT = 0,         // 0x4A4F3BEC
	_16BIT = 1,         // 0x16434158
	_8BIT = 2,          // 0x2EFEF517
	ATBITSET = 3,       // 0xB46B5F65
	_64BIT = 4,         // 0x3BB5B764
#else
	_32BIT = 0,         // 0xAF085554
	_16BIT = 1,         // 0x0D502D8E
	_8BIT = 2,          // 0xF2AAF53D
	ATBITSET = 3,       // 0xB46B5F65
#endif
};

enum class parMemberMapSubtype  // 0x9C9F1983
{
	ATMAP = 0,          // 0xD8C10171
	ATBINARYMAP = 1,    // 0x6560BA79
};

enum class parMemberStringSubtype  // 0xA5CF41A9
{
	MEMBER = 0,                 // 0x6CC11BB4
	POINTER = 1,                // 0x47073D6E
	CONST_STRING = 2,           // 0x757C1B9B
	ATSTRING = 3,               // 0x5CDCA61E
	WIDE_MEMBER = 4,            // 0xAC508104
	WIDE_POINTER = 5,           // 0x99D4A8CD
	ATWIDESTRING = 6,           // 0x3DED5509
	ATNONFINALHASHSTRING = 7,   // 0xDFE6E4AF
	ATFINALHASHSTRING = 8,      // 0x945E5945
	ATHASHVALUE = 9,            // 0xBD3CD157
	ATPARTIALHASHVALUE = 10,    // 0xD552B3C8
	ATNSHASHSTRING = 11,        // 0x893F9F69
	ATNSHASHVALUE = 12,         // 0x3767C917
#if RDR2
	ATHASHVALUE16U = 13,           // 0xE8282E2F
#endif
};

enum class parMemberStructSubtype  // 0x76214E40
{
	STRUCTURE = 0,                  // 0x3AC3050F
	EXTERNAL_NAMED = 1,             // 0xA53F8BA9
	EXTERNAL_NAMED_USERNULL = 2,    // 0x2DED4C19
	POINTER = 3,                    // 0x47073D6E
	SIMPLE_POINTER = 4,             // 0x67466543
};

#if RDR2
enum class parMemberGuidSubtype  // 0xA73F91EB
{
	_0xDF7EBE85 = 0, // 0xDF7EBE85
};
#endif

static std::string SubtypeToStr(parMemberType type, uint8_t subtype)
{
	switch (type)
	{
	case parMemberType::ARRAY:
		switch (static_cast<parMemberArraySubtype>(subtype))
		{
		case parMemberArraySubtype::ATARRAY: return "ATARRAY";
		case parMemberArraySubtype::ATFIXEDARRAY: return "ATFIXEDARRAY";
		case parMemberArraySubtype::ATRANGEARRAY: return "ATRANGEARRAY";
		case parMemberArraySubtype::POINTER: return "POINTER";
		case parMemberArraySubtype::MEMBER: return "MEMBER";
		case parMemberArraySubtype::_0x2087BB00: return "_0x2087BB00";
		case parMemberArraySubtype::POINTER_WITH_COUNT: return "POINTER_WITH_COUNT";
		case parMemberArraySubtype::POINTER_WITH_COUNT_8BIT_IDX: return "POINTER_WITH_COUNT_8BIT_IDX";
		case parMemberArraySubtype::POINTER_WITH_COUNT_16BIT_IDX: return "POINTER_WITH_COUNT_16BIT_IDX";
		case parMemberArraySubtype::VIRTUAL: return "VIRTUAL";
		}
		break;
	case parMemberType::ENUM:
		switch (static_cast<parMemberEnumSubtype>(subtype))
		{
#if RDR2
		case parMemberEnumSubtype::_64BIT: return "64BIT";
#endif
		case parMemberEnumSubtype::_32BIT: return "32BIT";
		case parMemberEnumSubtype::_16BIT: return "16BIT";
		case parMemberEnumSubtype::_8BIT: return "8BIT";
		}
		break;
	case parMemberType::BITSET:
		switch (static_cast<parMemberBitsetSubtype>(subtype))
		{
#if RDR2
		case parMemberBitsetSubtype::_64BIT: return "64BIT";
#endif
		case parMemberBitsetSubtype::_32BIT: return "32BIT";
		case parMemberBitsetSubtype::_16BIT: return "16BIT";
		case parMemberBitsetSubtype::_8BIT: return "8BIT";
		case parMemberBitsetSubtype::ATBITSET: return "ATBITSET";
		}
		break;
	case parMemberType::MAP:
		switch (static_cast<parMemberMapSubtype>(subtype))
		{
		case parMemberMapSubtype::ATMAP: return "ATMAP";
		case parMemberMapSubtype::ATBINARYMAP: return "ATBINARYMAP";
		}
		break;
	case parMemberType::STRING:
		switch (static_cast<parMemberStringSubtype>(subtype))
		{
		case parMemberStringSubtype::MEMBER: return "MEMBER";
		case parMemberStringSubtype::POINTER: return "POINTER";
		case parMemberStringSubtype::CONST_STRING: return "CONST_STRING";
		case parMemberStringSubtype::ATSTRING: return "ATSTRING";
		case parMemberStringSubtype::WIDE_MEMBER: return "WIDE_MEMBER";
		case parMemberStringSubtype::WIDE_POINTER: return "WIDE_POINTER";
		case parMemberStringSubtype::ATWIDESTRING: return "ATWIDESTRING";
		case parMemberStringSubtype::ATNONFINALHASHSTRING: return "ATNONFINALHASHSTRING";
		case parMemberStringSubtype::ATFINALHASHSTRING: return "ATFINALHASHSTRING";
		case parMemberStringSubtype::ATHASHVALUE: return "ATHASHVALUE";
		case parMemberStringSubtype::ATPARTIALHASHVALUE: return "ATPARTIALHASHVALUE";
		case parMemberStringSubtype::ATNSHASHSTRING: return "ATNSHASHSTRING";
		case parMemberStringSubtype::ATNSHASHVALUE: return "ATNSHASHVALUE";
#if RDR2
		case parMemberStringSubtype::ATHASHVALUE16U: return "ATHASHVALUE16U";
#endif
		}
		break;
	case parMemberType::STRUCT:
		switch (static_cast<parMemberStructSubtype>(subtype))
		{
		case parMemberStructSubtype::STRUCTURE: return "STRUCTURE";
		case parMemberStructSubtype::EXTERNAL_NAMED: return "EXTERNAL_NAMED";
		case parMemberStructSubtype::EXTERNAL_NAMED_USERNULL: return "EXTERNAL_NAMED_USERNULL";
		case parMemberStructSubtype::POINTER: return "POINTER";
		case parMemberStructSubtype::SIMPLE_POINTER: return "SIMPLE_POINTER";
		}
		break;
#if RDR2
	case parMemberType::GUID:
		switch (static_cast<parMemberGuidSubtype>(subtype))
		{
		case parMemberGuidSubtype::_0xDF7EBE85: return "_0xDF7EBE85";
		}
		break;
#endif
	default:
		switch (static_cast<parMemberCommonSubtype>(subtype))
		{
		case parMemberCommonSubtype::COLOR: return "COLOR";
#if RDR2
		case parMemberCommonSubtype::ANGLE: return "ANGLE";
#endif
		}
	}

	return std::to_string(subtype);
}

static const char* TypeToStr(parMemberType type)
{
	switch (type)
	{
	case parMemberType::BOOL: return "BOOL";
	case parMemberType::CHAR: return "CHAR";
	case parMemberType::UCHAR: return "UCHAR";
	case parMemberType::SHORT: return "SHORT";
	case parMemberType::USHORT: return "USHORT";
	case parMemberType::INT: return "INT";
	case parMemberType::UINT: return "UINT";
	case parMemberType::FLOAT: return "FLOAT";
	case parMemberType::VECTOR2: return "VECTOR2";
	case parMemberType::VECTOR3: return "VECTOR3";
	case parMemberType::VECTOR4: return "VECTOR4";
	case parMemberType::STRING: return "STRING";
	case parMemberType::STRUCT: return "STRUCT";
	case parMemberType::ARRAY: return "ARRAY";
	case parMemberType::ENUM: return "ENUM";
	case parMemberType::BITSET: return "BITSET";
	case parMemberType::MAP: return "MAP";
	case parMemberType::MATRIX34: return "MATRIX34";
	case parMemberType::MATRIX44: return "MATRIX44";
	case parMemberType::VEC2V: return "VEC2V";
	case parMemberType::VEC3V: return "VEC3V";
	case parMemberType::VEC4V: return "VEC4V";
	case parMemberType::MAT33V: return "MAT33V";
	case parMemberType::MAT34V: return "MAT34V";
	case parMemberType::MAT44V: return "MAT44V";
	case parMemberType::SCALARV: return "SCALARV";
	case parMemberType::BOOLV: return "BOOLV";
	case parMemberType::VECBOOLV: return "VECBOOLV";
	case parMemberType::PTRDIFFT: return "PTRDIFFT";
	case parMemberType::SIZET: return "SIZET";
	case parMemberType::FLOAT16: return "FLOAT16";
	case parMemberType::INT64: return "INT64";
	case parMemberType::UINT64: return "UINT64";
	case parMemberType::DOUBLE: return "DOUBLE";
#if RDR2
	case parMemberType::GUID: return "GUID";
	case parMemberType::_0xFE5A582C: return "_0xFE5A582C";
	case parMemberType::QUATV: return "QUATV";
#endif
	default: return "UNKNOWN";
	}
}

static const char* TypeToCasedStr(parMemberType type)
{
	switch (type)
	{
	case parMemberType::BOOL: return "bool";
	case parMemberType::CHAR: return "char";
	case parMemberType::UCHAR: return "uchar";
	case parMemberType::SHORT: return "short";
	case parMemberType::USHORT: return "ushort";
	case parMemberType::INT: return "int";
	case parMemberType::UINT: return "uint";
	case parMemberType::FLOAT: return "float";
	case parMemberType::VEC2V: return "vec2V";
	case parMemberType::VECTOR2: return "vec2";
	case parMemberType::VEC3V:  return "vec3V";
	case parMemberType::VECTOR3: return "vec3";
	case parMemberType::VEC4V:  return "vec4V";
	case parMemberType::VECTOR4: return "vec4";
	case parMemberType::STRING: return "string";
	case parMemberType::STRUCT: return "struct";
	case parMemberType::ARRAY: return "array";
	case parMemberType::ENUM: return "enum";
	case parMemberType::BITSET: return "bitset";
	case parMemberType::MAP: return "map";
	case parMemberType::MAT34V: return "matrix34V";
	case parMemberType::MATRIX34: return "matrix34";
	case parMemberType::MAT44V: return "matrix44V";
	case parMemberType::MATRIX44: return "matrix44";
	case parMemberType::MAT33V: return "matrix33V";
	case parMemberType::SCALARV: return "scalarV";
	case parMemberType::BOOLV: return "boolV";
	case parMemberType::VECBOOLV: return "vecBoolV";
	case parMemberType::PTRDIFFT: return "ptrdiff_t";
	case parMemberType::SIZET: return "size_t";
	case parMemberType::FLOAT16: return "float16";
	case parMemberType::INT64: return "int64";
	case parMemberType::UINT64: return "uint64";
	case parMemberType::DOUBLE: return "double";
#if RDR2
	case parMemberType::GUID: return "guid";
	case parMemberType::_0xFE5A582C: return "_0xFE5A582C";
	case parMemberType::QUATV: return "quatV";
#endif
	default: return "UNKNOWN";
	}
}

template<class T>
struct atArray
{
	T* Items;
	uint16_t Count;
	uint16_t Size;
};

template<class TKey, class TValue>
struct atMap
{
	struct Entry
	{
		TKey key;
		TValue value;
		Entry* next;
	};

	Entry** Buckets;
	uint16_t NumBuckets;
	uint16_t NumEntries;
	int8_t field_C[3];
	bool IsResizable;
};

template<class TKey, class TValue>
struct atBinaryMap
{
	struct DataPair
	{
		TKey Key;
		TValue Value;
	};

	bool IsSorted;
	atArray<DataPair> Pairs;
};

struct parDelegateHolderBase
{
	void* arg;
	void* func;
};

struct parMemberCommonData
{
	uint32_t name;
	uint8_t padding4[4];
	uint64_t offset;
	parMemberType type;
	uint8_t subType;
	uint16_t flags1;
	uint16_t flags2;
	uint16_t extraData; // specific to parMemberCommonData derived types
	void* attributes;
};

struct parMemberSimpleData : public parMemberCommonData
{
#if RDR2
	double initValue;
#else
	float initValue;
#endif
};

struct parMemberStringData : public parMemberCommonData
{
	uint32_t memberSize; // for subtype MEMBER and WIDE_MEMBER

	uint8_t GetNamespaceIndex() { return static_cast<uint8_t>(extraData); }
};

struct parMemberStructData : public parMemberCommonData
{
	using ExternalNamedResolveCallback = void*(*)(const char* name);
	using ExternalNamedGetNameCallback = const char*(*)(void* structPtr);
	using AllocateStructCallback = void*(*)(void* treeNode);

	struct parStructure* structure;
	ExternalNamedResolveCallback externalNamedResolve;
	ExternalNamedGetNameCallback externalNamedGetName;
	AllocateStructCallback allocateStruct;
};

struct parMemberEnumData : public parMemberCommonData
{
#if RDR2
	uint64_t initValue;
#else
	uint32_t initValue;
	uint32_t padding24;
#endif
	struct parEnumData* enumData;
	uint16_t valueCount;
	uint8_t padding32[0x6];
};

struct parMemberArrayData : public parMemberCommonData
{
	enum class AllocFlags : uint16_t
	{
		USE_PHYSICAL_ALLOCATOR = 1 << 0,
	};

	uint64_t itemByteSize;
	union
	{
		uint32_t arraySize;
		uint32_t countOffset; // for POINTER_WITH_COUNT types
	};
	uint32_t padding2C;
	parMemberCommonData* itemData;
	parDelegateHolderBase* virtualCallback;

	AllocFlags GetAllocFlags() { return static_cast<AllocFlags>(extraData); }
};
DEFINE_ENUM_FLAG_OPERATORS(parMemberArrayData::AllocFlags);

struct parMemberMapData : public parMemberCommonData
{
	parDelegateHolderBase* createIterator;
	parDelegateHolderBase* createInterface;
	parMemberCommonData* keyData;
	parMemberCommonData* valueData;
};

struct parMember
{
	void* __vftable;
	parMemberCommonData* data;
};

struct parStructure
{
	enum class Flags
#if RDR2
		: uint32_t
#else
		: uint16_t
#endif
	{
		_0xB9C5D274 = 1 << 0, // 0xB9C5D274
		HAS_NAMES = 1 << 1, // 0x47AF4932
		ALWAYS_HAS_NAMES = 1 << 2, // 0x9804A870
		_0x25CB183C = 1 << 3, // 0x25CB183C
		_0x62BE3669 = 1 << 4, // 0x62BE3669
		_0x22A1FBDB = 1 << 5, // 0x22A1FBDB
	};

	void* __vftable;
#if RDR2
	uint8_t critSection[0x28];
#endif
	uint32_t name;
	uint8_t padding[4];
	parStructure* baseStructure;
	uint64_t baseOffset;
	uint64_t structureSize;
	Flags flags;
	uint16_t alignment;
	uint16_t versionMajor;
	uint16_t versionMinor;
#if RDR2
	uint8_t padding5A[6];
#endif
	atArray<parMember*> members;
	void* extraAttributes;
	parDelegateHolderBase factoryNew;
	parDelegateHolderBase factoryPlacementNew;
	parDelegateHolderBase getStructureCB;
	parDelegateHolderBase factoryDelete;
	atBinaryMap<uint32_t, parDelegateHolderBase*> callbacks;
};
DEFINE_ENUM_FLAG_OPERATORS(parStructure::Flags);

struct parStructureStaticData
{
	uint32_t name;
	uint8_t padding[4];
	const char* nameStr;
	parStructure* parser;
	parMemberCommonData** membersData;
	uint32_t* membersOffsets;
	const char** memberNames;
	bool unkFlag1;
	bool unkFlag2;
};


struct parEnumValueData
{
#if RDR2
	uint32_t name;
	uint32_t padding4;
	uint64_t value;
#else
	uint32_t name;
	uint32_t value;
#endif
};

enum class parEnumFlags : uint16_t
{
	ENUM_STATIC = 1 << 0, // 0x83E077B4
	ENUM_HAS_NAMES = 1 << 1, // 0x4725AEB1
	ENUM_ALWAYS_HAS_NAMES = 1 << 2, // 0x0227ED1D
};
DEFINE_ENUM_FLAG_OPERATORS(parEnumFlags);

struct parEnumData
{
	parEnumValueData* values;
	const char** valueNames;
	uint16_t valueCount;
	parEnumFlags flags;
	uint32_t name;
};

struct parManager
{
#if RDR2
	uint8_t padding[0x48];
#else
	uint8_t padding[0x30];
#endif
	atMap<uint32_t, parStructure*> structures;
	// ...

	static parManager** sm_Instance;
};

parManager** parManager::sm_Instance = nullptr;

static void FlagsToStringAppend(std::string& s, const char* flagStr)
{
	if (s.size() > 0) s += ", ";
	s += flagStr;
}

#define FLAG_APPEND(flag) if ((flags & FLAG_TYPE::flag) == FLAG_TYPE::flag) FlagsToStringAppend(result, #flag)

static std::string FlagsToString(parEnumFlags flags)
{
	std::string result = "";
#define FLAG_TYPE parEnumFlags
	FLAG_APPEND(ENUM_STATIC);
	FLAG_APPEND(ENUM_HAS_NAMES);
	FLAG_APPEND(ENUM_ALWAYS_HAS_NAMES);
#undef FLAG_TYPE
	return result;
}

static std::string FlagsToString(parStructure::Flags flags)
{
	std::string result = "";
#define FLAG_TYPE parStructure::Flags
	FLAG_APPEND(_0xB9C5D274);
	FLAG_APPEND(HAS_NAMES);
	FLAG_APPEND(ALWAYS_HAS_NAMES);
	FLAG_APPEND(_0x25CB183C);
	FLAG_APPEND(_0x62BE3669);
	FLAG_APPEND(_0x22A1FBDB);
#undef FLAG_TYPE
	return result;
}

static std::string FlagsToString(parMemberArrayData::AllocFlags flags)
{
	std::string result = "";
#define FLAG_TYPE parMemberArrayData::AllocFlags
	FLAG_APPEND(USE_PHYSICAL_ALLOCATOR);
#undef FLAG_TYPE
	return result;
}

#undef FLAG_APPEND

static void FindParManager()
{
	spdlog::info("Searching parManager::sm_Instance...");
#if RDR2
	parManager::sm_Instance = hook::get_address<parManager**>(hook::get_pattern("48 8B 0D ? ? ? ? E8 ? ? ? ? 84 C0 74 29 48 8B 1D", 3));
#else
	parManager::sm_Instance = hook::get_address<parManager**>(hook::get_pattern("48 8B 0D ? ? ? ? 4C 89 74 24 ? 45 33 C0 48 8B D7 C6 44 24 ? ?", 3));
#endif
	spdlog::info("parManager::sm_Instance = {}", (void*)parManager::sm_Instance);
}

template<int FramesToSkip = 1>
static void LogStackTrace()
{
	if (!LoggingEnabled())
	{
		return;
	}

	void* stack[32];
	USHORT frames = CaptureStackBackTrace(FramesToSkip, 32, stack, NULL);

	spdlog::warn("\tStack Trace:");
	for (int i = 0; i < frames; i++)
	{
		void* address = stack[i];
		HMODULE module = NULL;
		GetModuleHandleEx(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCSTR)address, &module);
		char moduleName[256];
		GetModuleFileName(module, moduleName, 256);

		spdlog::warn("\t\t{:16X} - {}+{:08X}", (uintptr_t)address, std::filesystem::path(moduleName).filename().string().c_str(), ((uintptr_t)address - (uintptr_t)module));
	}
}

static std::string Link(const char* name)
{
	return Format("<a href=\"#%s\">%s</a>", name, name);
}

static std::string Type(parMemberCommonData* m, bool html = true)
{
	std::string mType = TypeToCasedStr(m->type);
	if (m->type == parMemberType::STRUCT)
	{
		parStructure* otherStruct = reinterpret_cast<parMemberStructData*>(m)->structure;
		const std::string otherName = otherStruct ? HashToStr(otherStruct->name) : "void";
		mType += " ";
		mType += otherStruct && html ? Link(otherName.c_str()) : otherName;
	}
	else if (m->type == parMemberType::ENUM)
	{
		parEnumData* otherEnum = reinterpret_cast<parMemberEnumData*>(m)->enumData;
		const std::string otherName = otherEnum ? HashToStr(otherEnum->name) : "NULL_ENUM";
		mType += " ";
		mType += otherEnum && html ? Link(otherName.c_str()) : otherName;
	}
	else if (m->type == parMemberType::BITSET)
	{
		parEnumData* otherEnum = reinterpret_cast<parMemberEnumData*>(m)->enumData;
		mType += html ? "&lt;enum" : "<enum";
		const std::string otherName = otherEnum ? HashToStr(otherEnum->name) : "NULL_ENUM";
		mType += " ";
		mType += otherEnum && html ? Link(otherName.c_str()) : otherName;
		mType += html ? "&gt;" : ">";
	}
	else if (m->type == parMemberType::ARRAY)
	{
		parMemberArrayData* arr = reinterpret_cast<parMemberArrayData*>(m);
		const std::string itemType = arr->itemData ? Type(arr->itemData, html) : "NULL_ITEM_DATA";
		mType += html ? "&lt;" : "<";
		mType += itemType;
		if (arr->arraySize != 0)
		{
			mType += ", ";
			mType += Format("%u", arr->arraySize);
		}
		mType += html ? "&gt;" : ">";
	}
	else if (m->type == parMemberType::MAP)
	{
		parMemberMapData* map = reinterpret_cast<parMemberMapData*>(m);
		const std::string keyType = map->keyData ? Type(map->keyData, html) : "NULL_KEY_DATA";
		const std::string valueType = map->valueData ? Type(map->valueData, html) : "NULL_VALUE_DATA";
		mType += html ? "&lt;" : "<";
		mType += keyType;
		mType += ", ";
		mType += valueType;
		mType += html ? "&gt;" : ">";
	}

	return mType;
}

static void PrintStruct(std::ofstream& f, parStructure* s, bool html, bool includeOffsets)
{
	const std::string sName = HashToStr(s->name);

	if (html)
	{
		f << Format("<pre class=\"prettyprint\" id=\"%s\">\n", sName.c_str());
	}

	f << Format("struct %s", sName.c_str());
	if (s->baseStructure != nullptr)
	{
		const std::string baseName = HashToStr(s->baseStructure->name);
		if (html)
		{
			const std::string baseLink = Link(baseName.c_str());
			f << " : " << baseLink;
		}
		else
		{
			f << " : " << baseName;
		}
	}
	f << "\n{\n";

	std::vector<parMember*> members(&s->members.Items[0], &s->members.Items[s->members.Count]);
	std::sort(members.begin(), members.end(), [](auto* a, auto* b) {
		return a->data->offset < b->data->offset;
	});

	std::string membersStr = "";
	int padding = 32;
	for (ptrdiff_t j = 0; j < members.size(); j++)
	{
		parMember* m = members[j];

		const std::string mTypeNoHtml = Type(m->data, false);
		const size_t sizeNoHtml = mTypeNoHtml.size();
		if (sizeNoHtml > ((int64_t)padding - 4))
		{
			// found a longer name, start again
			padding = sizeNoHtml + 4;
			j = -1;
			membersStr.clear();
			continue;
		}
		const std::string mType = html ? Type(m->data) : mTypeNoHtml;
		membersStr += Format("\t%-*s ", (padding + (mType.size() - sizeNoHtml)), mType.c_str());
		const std::string subType = SubtypeToStr(m->data->type, m->data->subType);
		const std::string mName = HashToStr(m->data->name) + ";";
		if (includeOffsets)
		{
			membersStr += Format("%-32s // offset:0x%03X\ttype:%s.%s\n", mName.c_str(), m->data->offset, TypeToStr(m->data->type), subType.c_str());
		}
		else
		{
			membersStr += Format("%-32s // type:%s.%s\n", mName.c_str(), TypeToStr(m->data->type), subType.c_str());
		}
	}
	f << membersStr;
	f << "};\n";
	if (html)
	{
		f << "</pre>\n";
	}
	else
	{
		f << "\n";
	}
}

static void PrintEnum(std::ofstream& f, parEnumData* e, bool html)
{
	const std::string eName = HashToStr(e->name);
	if (html)
	{
		f << Format("<pre class=\"prettyprint\" id=\"%s\">\n", eName.c_str());
	}

	f << Format("enum %s", eName.c_str());
	f << "\n{\n";
	for (size_t i = 0; i < e->valueCount; i++)
	{
		parEnumValueData* v = &e->values[i];

		const std::string vName = HashToStr(v->name);
		f << Format("\t%s = %u,\n", vName.c_str(), v->value);
	}
	f << "};\n";

	if (html)
	{
		f << "</pre>\n";
	}
	else
	{
		f << "\n";
	}
}

static void InitParManager()
{
#if RDR2

#else

	uintptr_t theAllocatorAddr = hook::get_address<uintptr_t>(hook::get_pattern("48 8D 1D ? ? ? ? A8 08 75 1D 83 C8 08 48 8B CB", 3));

	spdlog::info("rage::s_TheAllocator            = {}", (void*)theAllocatorAddr);
	spdlog::info("rage::s_TheAllocator::__vftable = {}", *(void**)theAllocatorAddr);

	uintptr_t tls = *(uintptr_t*)__readgsqword(0x58);
	*(uintptr_t*)(tls + 200) = theAllocatorAddr;
	*(uintptr_t*)(tls + 192) = theAllocatorAddr;
	*(uintptr_t*)(tls + 184) = theAllocatorAddr;

	// function that loads "common:/data/TVPlaylists", but before it initiliazes parManager if it is not initialized
	using Fn = bool (*)(void*);
	void* addr = hook::get_pattern("40 53 48 83 EC 40 48 83 3D ? ? ? ? ? 48 8B D9 75 28");

	// return early to avoid calling rage::parManager::LoadFromStructure, only initialize rage::parManager
	uint8_t* patchAddr = (uint8_t*)addr + 0x8D;
	patchAddr[0] = 0x48;
	patchAddr[1] = 0x83;
	patchAddr[2] = 0xC4;
	patchAddr[3] = 0x40; // add     rsp, 40h
	patchAddr[4] = 0x5B; // pop     rbx
	patchAddr[5] = 0xC3; // retn
	patchAddr[6] = 0x90; // nop

	((Fn)addr)(nullptr);
#endif

	spdlog::info("*parManager::sm_Instance = {}", (void*)*parManager::sm_Instance); spdlog::default_logger()->flush();
}

static void PrintHtmlHeader(std::ofstream& f)
{
	f << R"(
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Test</title>
    <script src="https://cdn.jsdelivr.net/gh/google/code-prettify@master/loader/run_prettify.js?autoload=true&amp;skin=default&amp;lang=css"></script>
    <style type="text/css">
    </style>
</head>

<body>
)";
}

static void PrintHtmlFooter(std::ofstream& f)
{
	f << R"(
</body>
</html>
)";
}

static std::string GetDumpBaseName()
{
	std::string baseName = "dump";

	auto build = GetGameBuild();
	if (build != 0xFFFF)
	{
		baseName = std::format("b{}", build);
	}

	return baseName;
}

static std::unordered_map<parStructure*, parStructureStaticData*> structureToStaticData;

struct CollectResult
{
	std::vector<parStructure*> structs;
	std::vector<parEnumData*> enums;
};

static CollectResult CollectStructs(parManager* parMgr)
{	std::vector<parStructure*> structs{};
	std::unordered_set<parEnumData*> enumsSet{};
	std::vector<parEnumData*> enums{};
	const auto addEnum = [&enumsSet, &enums](parEnumData* enumData)
	{
		if (enumsSet.insert(enumData).second)
		{
			enums.push_back(enumData);
		}
	};

	for (uint16_t i = 0; i < parMgr->structures.NumBuckets; i++)
	{
		auto* entry = parMgr->structures.Buckets[i];
		while (entry != nullptr)
		{
			parStructure* s = entry->value;

			structs.push_back(s);

			for (ptrdiff_t j = 0; j < s->members.Count; j++)
			{
				parMember* m = s->members.Items[j];

				if (m->data->type == parMemberType::ENUM || m->data->type == parMemberType::BITSET)
				{
					addEnum(reinterpret_cast<parMemberEnumData*>(m->data)->enumData);
				}

				if (m->data->type == parMemberType::MAP)
				{
					parMemberMapData* map = reinterpret_cast<parMemberMapData*>(m->data);

					if (map->keyData && (map->keyData->type == parMemberType::ENUM || map->keyData->type == parMemberType::BITSET))
					{
						addEnum(reinterpret_cast<parMemberEnumData*>(map->keyData)->enumData);
					}

					if (map->valueData && (map->valueData->type == parMemberType::ENUM || map->valueData->type == parMemberType::BITSET))
					{
						addEnum(reinterpret_cast<parMemberEnumData*>(map->valueData)->enumData);
					}
				}
			}

			entry = entry->next;
		}
	}

	return { std::move(structs), std::move(enums) };
}

static void DumpJsonMember(JsonWriter& w, std::optional<std::string_view> key, parMemberCommonData* m)
{
	if (m == nullptr)
	{
		w.Null(key);
		return;
	}

	w.BeginObject(key);
	w.UInt("name", m->name, json_uint_hex);
	w.UInt("offset", m->offset, json_uint_hex_no_zero_pad);
	w.UInt("flags1", m->flags1, json_uint_hex);
	w.UInt("flags2", m->flags2, json_uint_hex);
	w.String("type", TypeToStr(m->type));
	w.String("subtype", SubtypeToStr(m->type, m->subType));
	switch (m->type)
	{
	case parMemberType::STRUCT:
	{
		auto* structData = static_cast<parMemberStructData*>(m);
		if (structData->structure != nullptr)
		{
			w.UInt("structName", structData->structure->name, json_uint_hex);
		}
		else
		{
			w.Null("structName");
		}
		if (structData->externalNamedResolve != nullptr)
		{
			w.UInt("externalNamedResolveFunc", (uintptr_t)structData->externalNamedResolve - (uintptr_t)GetModuleHandle(NULL), json_uint_hex_no_zero_pad);
		}
		if (structData->externalNamedGetName != nullptr)
		{
			w.UInt("externalNamedGetNameFunc", (uintptr_t)structData->externalNamedGetName - (uintptr_t)GetModuleHandle(NULL), json_uint_hex_no_zero_pad);
		}
		if (structData->allocateStruct != nullptr)
		{
			w.UInt("allocateStructFunc", (uintptr_t)structData->allocateStruct - (uintptr_t)GetModuleHandle(NULL), json_uint_hex_no_zero_pad);
		}
	}
	break;
	case parMemberType::ARRAY:
	{
		auto* arrayData = static_cast<parMemberArrayData*>(m);
		DumpJsonMember(w, "item", arrayData->itemData);
		// virtualCallback unused in both GTA5 and RDR3 (though most ATARRAY members have it set pointing to a nullsub for some reason)
		//if (arrayData->virtualCallback != nullptr)
		//{
		//	w.UInt("virtualCallbackFunc", (uintptr_t)arrayData->virtualCallback->func - (uintptr_t)GetModuleHandle(NULL), json_uint_hex);
		//}
		w.String("allocFlags", FlagsToString(arrayData->GetAllocFlags()));
		switch (static_cast<parMemberArraySubtype>(m->subType))
		{
		case parMemberArraySubtype::ATARRAY:
		case parMemberArraySubtype::_0x2087BB00:
			// nothing to add
			break;
		case parMemberArraySubtype::ATFIXEDARRAY:
		case parMemberArraySubtype::ATRANGEARRAY:
		case parMemberArraySubtype::POINTER:
		case parMemberArraySubtype::MEMBER:
		case parMemberArraySubtype::VIRTUAL:
			w.UInt("arraySize", arrayData->arraySize, json_uint_dec);
			break;
		case parMemberArraySubtype::POINTER_WITH_COUNT:
		case parMemberArraySubtype::POINTER_WITH_COUNT_8BIT_IDX:
		case parMemberArraySubtype::POINTER_WITH_COUNT_16BIT_IDX:
			w.UInt("countOffset", arrayData->countOffset, json_uint_hex);
			break;
		}
	}
	break;
	case parMemberType::ENUM:
	case parMemberType::BITSET:
	{
		auto* enumData = static_cast<parMemberEnumData*>(m);
		w.UInt("enumName", enumData->enumData->name, json_uint_hex);
		w.UInt("initValue", enumData->initValue, json_uint_dec);
	}
	break;
	case parMemberType::MAP:
	{
		auto* mapData = static_cast<parMemberMapData*>(m);
		DumpJsonMember(w, "key", mapData->keyData);
		DumpJsonMember(w, "value", mapData->valueData);
		if (mapData->createIterator != nullptr)
		{
			w.UInt("createIteratorFunc", (uintptr_t)mapData->createIterator->func - (uintptr_t)GetModuleHandle(NULL), json_uint_hex_no_zero_pad);
		}
		if (mapData->createInterface != nullptr)
		{
			w.UInt("createInterfaceFunc", (uintptr_t)mapData->createInterface->func - (uintptr_t)GetModuleHandle(NULL), json_uint_hex_no_zero_pad);
		}
	}
	break;
	case parMemberType::STRING:
	{
		auto* stringData = static_cast<parMemberStringData*>(m);
		switch (static_cast<parMemberStringSubtype>(m->subType))
		{
		case parMemberStringSubtype::MEMBER:
		case parMemberStringSubtype::WIDE_MEMBER:
			w.UInt("memberSize", stringData->memberSize, json_uint_dec);
			break;
		case parMemberStringSubtype::ATNSHASHSTRING:
		case parMemberStringSubtype::ATNSHASHVALUE:
			w.UInt("namespaceIndex", stringData->GetNamespaceIndex(), json_uint_dec);
			break;
		}
	}
	break;
	case parMemberType::BOOL:
	case parMemberType::CHAR:
	case parMemberType::UCHAR:
	case parMemberType::SHORT:
	case parMemberType::USHORT:
	case parMemberType::INT:
	case parMemberType::UINT:
	case parMemberType::FLOAT:
	case parMemberType::SCALARV:
	case parMemberType::BOOLV:
	case parMemberType::PTRDIFFT:
	case parMemberType::SIZET:
	case parMemberType::FLOAT16:
	case parMemberType::INT64:
	case parMemberType::UINT64:
	case parMemberType::DOUBLE:
	{
		auto* simpleData = static_cast<parMemberSimpleData*>(m);
#if RDR2
		w.Double("initValue", simpleData->initValue);
#else
		w.Float("initValue", simpleData->initValue);
#endif
	}
	break;
	}
	w.EndObject();
}

static void DumpJsonStructure(JsonWriter& w, std::optional<std::string_view> key, parStructure* s)
{
	if (s == nullptr)
	{
		w.Null(key);
		return;
	}

	auto* d = structureToStaticData[s];
	w.BeginObject(key);
	{
		w.UInt("name", s->name, json_uint_hex);
		if (d->nameStr != nullptr)
		{
			w.String("nameStr", d->nameStr);
		}
		if (s->baseStructure != nullptr)
		{
			w.BeginObject("base");
			w.UInt("name", s->baseStructure->name, json_uint_hex);
			w.UInt("offset", s->baseOffset, json_uint_hex_no_zero_pad);
			w.EndObject();
		}
		w.UInt("size", s->structureSize, json_uint_hex_no_zero_pad);
		w.UInt("alignment", s->alignment, json_uint_hex_no_zero_pad);
		w.String("flags", FlagsToString(s->flags));
		w.String("version", std::format("{}.{}", s->versionMajor, s->versionMinor));
		w.Bool("staticDataUnkFlag1", d->unkFlag1);
		w.Bool("staticDataUnkFlag2", d->unkFlag2);
		w.BeginArray("members");
		for (size_t i = 0; i < s->members.Count; i++)
		{
			auto* m = s->members.Items[i];
			DumpJsonMember(w, std::nullopt, m->data);
		}
		w.EndArray();
		if (d->memberNames != nullptr)
		{
			w.BeginArray("memberNames");
			for (size_t i = 0; i < s->members.Count; i++)
			{
				auto* n = d->memberNames[i];
				w.String(std::nullopt, n);
			}
			w.EndArray();
		}

		w.BeginObject("factories");
		if (s->factoryNew.func != nullptr)
		{
			w.UInt("new", (uintptr_t)s->factoryNew.func - (uintptr_t)GetModuleHandle(NULL), json_uint_hex_no_zero_pad);
		}
		else
		{
			w.Null("new");
		}
		if (s->factoryPlacementNew.func != nullptr)
		{
			w.UInt("placementNew", (uintptr_t)s->factoryPlacementNew.func - (uintptr_t)GetModuleHandle(NULL), json_uint_hex_no_zero_pad);
		}
		else
		{
			w.Null("placementNew");
		}
		if (s->factoryDelete.func != nullptr)
		{
			w.UInt("delete", (uintptr_t)s->factoryDelete.func - (uintptr_t)GetModuleHandle(NULL), json_uint_hex_no_zero_pad);
		}
		else
		{
			w.Null("delete");
		}
		w.EndObject();

		if (s->getStructureCB.func != nullptr)
		{
			w.UInt("getStructureCB", (uintptr_t)s->getStructureCB.func - (uintptr_t)GetModuleHandle(NULL), json_uint_hex_no_zero_pad);
		}
		else
		{
			w.Null("getStructureCB");
		}

		if (s->callbacks.Pairs.Count > 0)
		{
			w.BeginObject("callbacks");
			for (size_t i = 0; i < s->callbacks.Pairs.Count; i++)
			{
				auto& cb = s->callbacks.Pairs.Items[i];
				std::string key = "";
				switch (cb.Key)
				{
				case joaat_literal("preloadfast"): key = "PreLoadFast"; break;
				case joaat_literal("preload"): key = "PreLoad"; break;
				case joaat_literal("postload"): key = "PostLoad"; break;
				case joaat_literal("presave"): key = "PreSave"; break;
				case joaat_literal("postsave"): key = "PostSave"; break;
				case joaat_literal("removefromstore"): key = "RemoveFromStore"; break;
				case joaat_literal("preset"): key = "PreSet"; break;
				case joaat_literal("postset"): key = "PostSet"; break;
				case joaat_literal("presetfast"): key = "PreSetFast"; break;
				case joaat_literal("postsetfast"): key = "PostSetFast"; break;
				case joaat_literal("postpsoplace"): key = "PostPsoPlace"; break;
				case joaat_literal("visitor"): key = "Visitor"; break;
				default: key = std::format("callback_0x{:0{}X}", cb.Key, 8); break;
				}

				w.UInt(key, (uintptr_t)cb.Value->func - (uintptr_t)GetModuleHandle(NULL), json_uint_hex_no_zero_pad);
			}
			w.EndObject();
		}
	}
	w.EndObject();
}

static void DumpJsonEnum(JsonWriter& w, std::optional<std::string_view> key, parEnumData* e)
{
	if (e == nullptr)
	{
		w.Null(key);
		return;
	}

	w.BeginObject(key);
	w.UInt("name", e->name, json_uint_hex);
	w.String("flags", FlagsToString(e->flags));
	w.BeginArray("values");
	for (size_t i = 0; i < e->valueCount; i++)
	{
		auto& v = e->values[i];
		w.BeginObject();
		w.UInt("name", v.name, json_uint_hex);
		w.UInt("value", v.value, json_uint_dec);
		w.EndObject();
	}
	w.EndArray();
	if (e->valueNames != nullptr)
	{
		w.BeginArray("valueNames");
		for (size_t i = 0; i < e->valueCount; i++)
		{
			auto* n = e->valueNames[i];
			w.String(std::nullopt, n);
		}
		w.EndArray();
	}
	w.EndObject();
}

static void DumpJson(parManager* parMgr)
{
	const auto collection = CollectStructs(parMgr);
	auto& structs = collection.structs;
	auto& enums = collection.enums;

	auto baseName = GetDumpBaseName();
	JsonWriter w{ baseName + ".json" };

	w.BeginObject();
#if RDR2
	w.String("game", "rdr3");
#else
	w.String("game", "gta5");
#endif
	w.UInt("build", GetGameBuild(), json_uint_dec);
	w.BeginArray("structs");
	for (parStructure* s : structs)
	{
		DumpJsonStructure(w, std::nullopt, s);
	}
	w.EndArray();
	w.BeginArray("enums");
	for (parEnumData* e : enums)
	{
		DumpJsonEnum(w, std::nullopt, e);
	}
	w.EndArray();
	w.EndObject();
}

static void Dump(parManager* parMgr)
{
	spdlog::info("Begin dump..."); spdlog::default_logger()->flush();

	auto baseName = GetDumpBaseName();
	std::ofstream outHtml{ baseName + ".html" };
	std::ofstream outTxt{ baseName + ".txt" };
	std::ofstream outHtmlWithOffsets{ baseName + "_with_offsets.html" };
	std::ofstream outTxtWithOffsets{ baseName + "_with_offsets.txt" };

	PrintHtmlHeader(outHtml);
	PrintHtmlHeader(outHtmlWithOffsets);

	auto collection = CollectStructs(parMgr);
	auto& structs = collection.structs;
	auto& enums = collection.enums;

	spdlog::info("{} structs", structs.size());
	spdlog::info("{} enums", enums.size());

	std::sort(structs.begin(), structs.end(), [](auto* a, auto* b) { return HashToStr(a->name) < HashToStr(b->name); });
	std::sort(enums.begin(), enums.end(), [](auto* a, auto* b) { return HashToStr(a->name) < HashToStr(b->name); });

	for (parStructure* s : structs)
	{
		PrintStruct(outHtml, s, true, false);
		PrintStruct(outTxt, s, false, false);
		PrintStruct(outHtmlWithOffsets, s, true, true);
		PrintStruct(outTxtWithOffsets, s, false, true);
	}

	for (parEnumData* e : enums)
	{
		PrintEnum(outHtml, e, true);
		PrintEnum(outTxt, e, false);
		PrintEnum(outHtmlWithOffsets, e, true);
		PrintEnum(outTxtWithOffsets, e, false);
	}

	PrintHtmlFooter(outHtml);
	PrintHtmlFooter(outHtmlWithOffsets);

	spdlog::info("Dump done"); spdlog::default_logger()->flush();
}

static void(*rage__parStructure__BuildStructureFromStaticData_orig)(parStructure* This, parStructureStaticData* staticData);
static void rage__parStructure__BuildStructureFromStaticData_detour(parStructure* This, parStructureStaticData* staticData)
{
	structureToStaticData[This] = staticData;
	
	rage__parStructure__BuildStructureFromStaticData_orig(This, staticData);
}

static DWORD WINAPI Main()
{
	if (LoggingEnabled())
	{
		spdlog::set_default_logger(spdlog::basic_logger_mt("file_logger", "DumpStructs.log"));
	}
	else
	{
		spdlog::set_level(spdlog::level::off);
	}


	spdlog::info("Initializing...");

	void* rage__parStructure__BuildStructureFromStaticData =
#if RDR2
		hook::get_pattern("89 41 30 41 BF ? ? ? ? 4D 85 F6 74 58", -0x24);
#else
		hook::get_pattern("48 8B 05 ? ? ? ? 48 83 7A ? ? 48 8B FA 44 8A 60 5C 8B 02", -0x1D);
#endif

	MH_Initialize();
	MH_CreateHook(rage__parStructure__BuildStructureFromStaticData, &rage__parStructure__BuildStructureFromStaticData_detour, (void**)&rage__parStructure__BuildStructureFromStaticData_orig);
	MH_EnableHook(MH_ALL_HOOKS);

	FindParManager();

	const auto startTime = std::chrono::steady_clock::now();

	LoadHashes();

	const auto endTime = std::chrono::steady_clock::now();

	spdlog::info("Initialization finished - Took {} ms", std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count());

	Sleep(25'000);

	if (*parManager::sm_Instance == nullptr)
	{
		spdlog::info("parManager::sm_Instance is null, initializing it");

		InitParManager();
		if (*parManager::sm_Instance == nullptr)
		{
			spdlog::info("parManager::sm_Instance is still null, returning"); spdlog::default_logger()->flush();
			return 0;
		}
	}
	
	DumpJson(*parManager::sm_Instance);
	Dump(*parManager::sm_Instance);

	return 0;
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved)
{
	if (ul_reason_for_call == DLL_PROCESS_ATTACH)
	{
		CloseHandle(CreateThread(NULL, NULL, (LPTHREAD_START_ROUTINE)Main, NULL, NULL, NULL));
	}
	else if (ul_reason_for_call == DLL_PROCESS_DETACH)
	{
		spdlog::shutdown();
	}

	return TRUE;
}
