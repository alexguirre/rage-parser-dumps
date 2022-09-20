#pragma once
#include <cstdint>
#include <string>
#include <Windows.h>


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
#if RDR3
	GUID = 34,
	_0xFE5A582C = 35,
	QUATV = 36,
#endif
};

enum class parMemberCommonSubtype
{
	// these don't seem to be used while parsing, probably used by internal engine tools
	COLOR = 1, // used with UINT, VECTOR3 (RDR3)
#if RDR3
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
#if RDR3
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
#if RDR3
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
#if RDR3
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

#if RDR3
enum class parMemberGuidSubtype  // 0xA73F91EB
{
	_0xDF7EBE85 = 0, // 0xDF7EBE85
};
#endif

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
#if RDR3
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
#if RDR3
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
#if RDR3
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
#if RDR3
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
#if RDR3
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
#if RDR3
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
#if RDR3
	uint8_t padding[0x48];
#else
	uint8_t padding[0x30];
#endif
	atMap<uint32_t, parStructure*> structures;
	// ...

	static parManager** sm_Instance;
};


std::string SubtypeToStr(parMemberType type, uint8_t subtype);
const char* TypeToStr(parMemberType type);

std::string FlagsToString(parEnumFlags flags);
std::string FlagsToString(parStructure::Flags flags);
std::string FlagsToString(parMemberArrayData::AllocFlags flags);
