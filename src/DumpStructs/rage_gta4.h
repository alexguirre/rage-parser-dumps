#pragma once
#if MP3 || GTA4
#ifndef WIN32
#error MP3/GTA4 only supports 32-bit builds!
#endif

#include <cstdint>
#include <string>


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
	Entry TMP;
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

struct Func
{
  void *func;
  int field_4;
  int field_8;
  void *thunk;
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
	MATRIX34 = 15,
	MATRIX44 = 16,
};

enum class parMemberCommonSubtype
{
	// these don't seem to be used while parsing, probably used by internal engine tools
	COLOR = 1, // used with UINT, VECTOR3
};

#if MP3
enum class parMemberEnumSubtype
{
	_32BIT = 0,
	_16BIT = 1,
	_8BIT = 2,
};
#endif

enum class parMemberArraySubtype
{
	ATARRAY = 0,
	ATFIXEDARRAY = 1,
	ATRANGEARRAY = 2,
	POINTER = 3,
	MEMBER = 4,
	_UNKNOWN_5 = 5,	// struct { void *begin, *end }; maybe?
	_UNKNOWN_6 = 6, // unused
	_0x2087BB00 = 7, // unused, 32-bit atArray
#if MP3
	POINTER_WITH_COUNT = 8,
	POINTER_WITH_COUNT_8BIT_IDX = 9,
	POINTER_WITH_COUNT_16BIT_IDX = 10,
#endif
};

enum class parMemberStringSubtype
{
	MEMBER = 0,
	POINTER = 1,
	_UNKNOWN_2 = 2, // std::string?
	CONST_STRING = 3,
#if MP3
	ATSTRING = 4,
	WIDE_MEMBER = 5,
	WIDE_POINTER = 6,
	ATWIDESTRING = 7,
#endif
};

enum class parMemberStructSubtype
{
	STRUCTURE = 0,
	EXTERNAL_NAMED = 1,
	EXTERNAL_NAMED_USERNULL = 2,
	POINTER = 3,
	SIMPLE_POINTER = 4,
};

struct parMemberCommonData
{
	const char* name;
	uint32_t nameHash;
	uint32_t offset;
	parMemberType type;
	uint8_t subType;
	uint16_t flags1;
	uint16_t flags2;
	uint16_t extraData; // specific to parMemberCommonData derived types
#if MP3
	void *attributes;
#endif
};

struct parMemberSimpleData : parMemberCommonData
{
	float initValue;
};

struct parMemberVectorData : parMemberCommonData
{
	float initValues[4];
};

struct parMemberMatrixData : parMemberCommonData
{
	// GTA4 doesn't have initValues, parInitVisitor is hardcoded to the identity matrix
#if MP3
	float initValues[16];
#endif
};

struct parMemberStringData : parMemberCommonData
{
	uint32_t memberSize; // for subtype MEMBER
};

struct parMemberStructData : parMemberCommonData
{
	using ExternalNamedResolveCallback = void*(*)(const char* name);
	using ExternalNamedGetNameCallback = const char*(*)(void* structPtr);
	using AllocateStructCallback = void*(*)(void* treeNode);

	struct parStructure* structure;
	ExternalNamedResolveCallback externalNamedResolve;
	ExternalNamedGetNameCallback externalNamedGetName;
	AllocateStructCallback allocateStruct;
};

struct parEnumValueData
{
	uint32_t name;
	int32_t value;
};

struct parMemberEnumData : parMemberCommonData
{
	int32_t initValue;
	parEnumValueData* values;
	const char **valueNames;
	uint32_t valueCount;
};

struct parMemberArrayData : parMemberCommonData
{
	uint32_t itemByteSize;
	union
	{
		uint32_t arraySize;
		uint32_t countOffset; // for POINTER_WITH_COUNT types
	};
	parMemberCommonData* itemData;
	Func allocator;
};

struct parMember
{
	parMemberCommonData* data;

	virtual ~parMember() = 0;
	//...

	uint32_t GetSize();
	uint32_t FindAlign();
};

struct parMemberArray : parMember
{
	parMember* item;
};

struct parStructure
{
	void* __vftable;
	const char* name;
	parStructure* baseStructure;
	uint32_t baseOffset;
	uint32_t structureSize;
	atArray<parMember*> members;
	uint16_t versionMajor;
	uint16_t versionMinor;
#if MP3
	void* extraAttributes; // TODO(MP3): verify this
#endif
	parDelegateHolderBase factoryNew;
#if MP3
	parDelegateHolderBase unknownDelegate; // always default function set in ctor
#endif
	parDelegateHolderBase getStructureCB;
	atBinaryMap<uint32_t, parDelegateHolderBase*> callbacks;
	bool bBatchAddingDelegates;

	uint32_t FindAlign();
};

struct parManager
{
	uint8_t padding[0x18];
	atMap<const char*, parStructure**> structures;
	// ...

	static parManager** sm_Instance;
};


std::string SubtypeToStr(parMemberType type, uint8_t subtype);

const char* EnumToString(parMemberType type);
#endif // GTA4 || MP3
