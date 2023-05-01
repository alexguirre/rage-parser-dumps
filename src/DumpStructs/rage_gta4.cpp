#if MP3 || GTA4
#include "rage_gta4.h"
#include <Hooking.Patterns.h>

parManager** parManager::sm_Instance = nullptr;

#if GTA4
uint32_t parMember::GetSize()
{
	// TODO(GTA4): parMember::GetSize
	return 0;
}
#endif

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
		case parMemberArraySubtype::_UNKNOWN_5: return "_UNKNOWN_5";
		case parMemberArraySubtype::_UNKNOWN_6: return "_UNKNOWN_6";
		case parMemberArraySubtype::_0x2087BB00: return "_0x2087BB00";
#if MP3
		case parMemberArraySubtype::POINTER_WITH_COUNT: return "POINTER_WITH_COUNT";
		case parMemberArraySubtype::POINTER_WITH_COUNT_8BIT_IDX: return "POINTER_WITH_COUNT_8BIT_IDX";
		case parMemberArraySubtype::POINTER_WITH_COUNT_16BIT_IDX: return "POINTER_WITH_COUNT_16BIT_IDX";
#endif
		}
		break;
#if MP3
	case parMemberType::ENUM:
		switch (static_cast<parMemberEnumSubtype>(subtype))
		{
		case parMemberEnumSubtype::_32BIT: return "_32BIT";
		case parMemberEnumSubtype::_16BIT: return "_16BIT";
		case parMemberEnumSubtype::_8BIT: return "_8BIT";
		}
		break;
#endif
	case parMemberType::STRING:
		switch (static_cast<parMemberStringSubtype>(subtype))
		{
		case parMemberStringSubtype::MEMBER: return "MEMBER";
		case parMemberStringSubtype::POINTER: return "POINTER";
		case parMemberStringSubtype::_UNKNOWN_2: return "_UNKNOWN_2";
		case parMemberStringSubtype::CONST_STRING: return "CONST_STRING";
#if MP3
		case parMemberStringSubtype::ATSTRING: return "ATSTRING";
		case parMemberStringSubtype::WIDE_MEMBER: return "WIDE_MEMBER";
		case parMemberStringSubtype::WIDE_POINTER: return "WIDE_POINTER";
		case parMemberStringSubtype::ATWIDESTRING: return "ATWIDESTRING";
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
	default:
		switch (static_cast<parMemberCommonSubtype>(subtype))
		{
		case parMemberCommonSubtype::COLOR: return "COLOR";
		}
	}

	return std::to_string(subtype);
}

const char* EnumToString(parMemberType type)
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
	case parMemberType::MATRIX34: return "MATRIX34";
	case parMemberType::MATRIX44: return "MATRIX44";
	default: return "UNKNOWN";
	}
}

const char* EnumToString(parAttribute::Type type)
{
	switch (type)
	{
	case parAttribute::Type::String: return "String";
	case parAttribute::Type::Int64:  return "Int64";
	case parAttribute::Type::Double: return "Double";
	case parAttribute::Type::Bool:   return "Bool";
	default: return "UNKNOWN";
	}
}
#endif
