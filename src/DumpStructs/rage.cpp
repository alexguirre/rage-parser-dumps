#include "rage.h"

parManager** parManager::sm_Instance = nullptr;

std::string SubtypeToStr(parMemberType type, uint8_t subtype)
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
#if RDR3
		case parMemberEnumSubtype::_64BIT: return "_64BIT";
#endif
		case parMemberEnumSubtype::_32BIT: return "_32BIT";
		case parMemberEnumSubtype::_16BIT: return "_16BIT";
		case parMemberEnumSubtype::_8BIT: return "_8BIT";
		}
		break;
	case parMemberType::BITSET:
		switch (static_cast<parMemberBitsetSubtype>(subtype))
		{
#if RDR3
		case parMemberBitsetSubtype::_64BIT: return "_64BIT";
#endif
		case parMemberBitsetSubtype::_32BIT: return "_32BIT";
		case parMemberBitsetSubtype::_16BIT: return "_16BIT";
		case parMemberBitsetSubtype::_8BIT: return "_8BIT";
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
#if RDR3
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
#if RDR3
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
#if RDR3
		case parMemberCommonSubtype::ANGLE: return "ANGLE";
#endif
		}
	}

	return std::to_string(subtype);
}

const char* TypeToStr(parMemberType type)
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
#if RDR3
	case parMemberType::GUID: return "GUID";
	case parMemberType::_0xFE5A582C: return "_0xFE5A582C";
	case parMemberType::QUATV: return "QUATV";
#endif
	default: return "UNKNOWN";
	}
}

static void FlagsToStringAppend(std::string& s, const char* flagStr)
{
	if (s.size() > 0) s += ", ";
	s += flagStr;
}

#define FLAG_APPEND(flag) if ((flags & FLAG_TYPE::flag) == FLAG_TYPE::flag) FlagsToStringAppend(result, #flag)

std::string FlagsToString(parEnumFlags flags)
{
	std::string result = "";
#define FLAG_TYPE parEnumFlags
	FLAG_APPEND(ENUM_STATIC);
	FLAG_APPEND(ENUM_HAS_NAMES);
	FLAG_APPEND(ENUM_ALWAYS_HAS_NAMES);
#undef FLAG_TYPE
	return result;
}

std::string FlagsToString(parStructure::Flags flags)
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

std::string FlagsToString(parMemberArrayData::AllocFlags flags)
{
	std::string result = "";
#define FLAG_TYPE parMemberArrayData::AllocFlags
	FLAG_APPEND(USE_PHYSICAL_ALLOCATOR);
#undef FLAG_TYPE
	return result;
}

#undef FLAG_APPEND
