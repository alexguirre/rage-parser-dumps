#if GTA4
#include "rage_gta4.h"
#include <Hooking.Patterns.h>

parManager** parManager::sm_Instance = nullptr;

uint32_t parStructure::FindAlign()
{
	// TODO(GTA4): parStructure::FindAlign
	return 0;
}

uint32_t parMember::GetSize()
{
	// TODO(GTA4): parMember::GetSize
	return 0;
}

uint32_t parMember::FindAlign()
{
	// TODO(GTA4): parMember::FindAlign
	return 0;
}

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
		}
		break;
	case parMemberType::STRING:
		switch (static_cast<parMemberStringSubtype>(subtype))
		{
		case parMemberStringSubtype::MEMBER: return "MEMBER";
		case parMemberStringSubtype::POINTER: return "POINTER";
		case parMemberStringSubtype::_UNKNOWN_2: return "_UNKNOWN_2";
		case parMemberStringSubtype::CONST_STRING: return "CONST_STRING";
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
#endif
