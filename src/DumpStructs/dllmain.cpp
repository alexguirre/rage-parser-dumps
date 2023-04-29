#include <Windows.h>
#include <spdlog/spdlog.h>
#include <spdlog/sinks/basic_file_sink.h>
#include "Hooking.Patterns.h"
#include "Hooking.h"
#include <MinHook.h>
#include <unordered_map>
#include <string>
#include <optional>
#include <unordered_set>
#include <vector>
#include <format>

#include "rage.h"
#include "rage_gta4.h"

#include "JsonWriter.h"

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

static std::tuple<uint16_t, uint16_t, uint16_t, uint16_t> GetGameBuild()
{
	const char* exeName =
#if RDR3
		"RDR2.exe";
#elif GTA5
		"GTA5.exe";
#elif GTA4
		"GTAIV.exe";
#endif

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
					const auto major = (verInfo->dwFileVersionMS >> 16) & 0xFFFF;
					const auto minor = verInfo->dwFileVersionMS & 0xFFFF;
					const auto build = (verInfo->dwFileVersionLS >> 16) & 0xFFFF;
					const auto revision = verInfo->dwFileVersionLS & 0xFFFF;
					return { major, minor, build, revision };
				}
			}
		}
	}

	return { 0xFFFF, 0xFFFF, 0xFFFF, 0xFFFF };
}

static void FindParManager()
{
	spdlog::info("Searching parManager::sm_Instance...");
#if RDR3
	parManager::sm_Instance = hook::get_address<parManager**>(hook::get_pattern("48 8B 0D ? ? ? ? E8 ? ? ? ? 84 C0 74 29 48 8B 1D", 3));
#elif GTA5
	parManager::sm_Instance = hook::get_address<parManager**>(hook::get_pattern("48 8B 0D ? ? ? ? 4C 89 74 24 ? 45 33 C0 48 8B D7 C6 44 24 ? ?", 3));
#elif GTA4
	parManager::sm_Instance = *hook::get_pattern<parManager**>("A1 ? ? ? ? 8B 58 28 C1 EB 11 80 E3 01 74 1D", 1);
#endif
	spdlog::info("parManager::sm_Instance = {}", (void*)parManager::sm_Instance);
}

static void InitParManager()
{
#if RDR3

#elif GTA5
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
#elif GTA4

#endif

	spdlog::info("*parManager::sm_Instance = {}", (void*)*parManager::sm_Instance); spdlog::default_logger()->flush();
}

static std::string GetDumpBaseName()
{
	std::string baseName = "dump";

	auto [major, minor, build, revision] = GetGameBuild();
#if RDR3 || GTA5
	if (build != 0xFFFF)
	{
		baseName = std::format("b{}", build);
	}
#elif GTA4
	if (major != 0xFFFF)
	{
		baseName = std::format("b{}.{}.{}.{}", major, minor, build, revision);
	}
#endif

	return baseName;
}

#if RDR3 || GTA5
static std::unordered_map<parStructure*, parStructureStaticData*> structureToStaticData;
#endif

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
#if RDR3 || GTA5
			parStructure* s = entry->value;
#elif GTA4
			parStructure* s = *entry->value;
#endif

			structs.push_back(s);

			// no enums used in GTA4
#if RDR3 || GTA5
			for (ptrdiff_t j = 0; j < s->members.Count; j++)
			{
				parMember* m = s->members.Items[j];

				if (m->data->type == parMemberType::ENUM || m->data->type == parMemberType::BITSET)
				{
					addEnum(reinterpret_cast<parMemberEnumData*>(m->data)->enumData);
				}
				else if (m->data->type == parMemberType::ARRAY)
				{
					parMemberArrayData* arr = reinterpret_cast<parMemberArrayData*>(m->data);
					if (arr->itemData && (arr->itemData->type == parMemberType::ENUM || arr->itemData->type == parMemberType::BITSET))
					{
						addEnum(reinterpret_cast<parMemberEnumData*>(arr->itemData)->enumData);
					}
				}
				else if (m->data->type == parMemberType::MAP)
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
#endif

			entry = entry->next;
		}
	}

	return { std::move(structs), std::move(enums) };
}

#if RDR3 || GTA5
static void DumpJsonAttributeList(JsonWriter& w, std::optional<std::string_view> key, parAttributeList* attributes)
{
	w.BeginObject(key);
	if (attributes->UserData1 != 0)
	{
		w.UInt("userData1", attributes->UserData1, json_uint_dec);
	}
	if (attributes->UserData2 != 0)
	{
		w.UInt("userData2", attributes->UserData2, json_uint_dec);
	}
	w.BeginArray("list");
	auto& list = attributes->attributes;
	for (size_t i = 0; i < list.Count; i++)
	{
		auto& attr = list.Items[i];
		w.BeginObject();
		w.String("name", attr.name);
		w.String("type", EnumToString(attr.type));
		switch (attr.type)
		{
		case parAttribute::String: w.String("value", attr.value.asString); break;
		case parAttribute::Int64:  w.Int("value", attr.value.asInt64); break;
		case parAttribute::Double: w.Double("value", attr.value.asDouble); break;
		case parAttribute::Bool:   w.Bool("value", attr.value.asBool); break;
		};
		w.EndObject();
	}
	w.EndArray();
	w.EndObject();
}
#endif

static void DumpJsonMember(JsonWriter& w, std::optional<std::string_view> key, parMember* member, std::optional<std::string_view> nameOverride = std::nullopt)
{
	if (member == nullptr)
	{
		w.Null(key);
		return;
	}

	auto* m = member->data;
	w.BeginObject(key);
	if (nameOverride.has_value())
	{
		w.String("name", nameOverride.value());
	}
	else
	{
#if RDR3 || GTA5
		w.UInt("name", m->name, json_uint_hex);
#elif GTA4
		w.String("name", m->name);
#endif
	}
	w.UInt("offset", m->offset, json_uint_dec);
	w.UInt("size", member->GetSize(), json_uint_dec);
	w.UInt("align", member->FindAlign(), json_uint_dec);
	w.UInt("flags1", m->flags1, json_uint_hex);
	w.UInt("flags2", m->flags2, json_uint_hex);
#if RDR3 || GTA5
	const bool usesExtraData = m->type == parMemberType::ARRAY || m->type == parMemberType::STRING;
#elif GTA4
	const bool usesExtraData = false;
#endif
	if (m->extraData != 0 && !usesExtraData)
	{
		w.UInt("extraData", m->extraData, json_uint_hex);
	}
	w.String("type", EnumToString(m->type));
	w.String("subtype", SubtypeToStr(m->type, m->subType));
#if RDR3 || GTA5
	if (m->attributes != nullptr)
	{
		DumpJsonAttributeList(w, "attributes", m->attributes);
	}
#endif
	switch (m->type)
	{
	case parMemberType::STRUCT:
	{
		auto* structData = static_cast<parMemberStructData*>(m);
		if (structData->structure != nullptr)
		{
#if RDR3 || GTA5
			w.UInt("structName", structData->structure->name, json_uint_hex);
#elif GTA4
			w.String("structName", structData->structure->name);
#endif
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
		auto* array = static_cast<parMemberArray*>(member);
		auto* arrayData = static_cast<parMemberArrayData*>(m);
		DumpJsonMember(w, "item", array->item);
		// virtualCallback unused in both GTA5 and RDR3 (though most ATARRAY members have it set pointing to a nullsub for some reason)
		//if (arrayData->virtualCallback != nullptr)
		//{
		//	w.UInt("virtualCallbackFunc", (uintptr_t)arrayData->virtualCallback->func - (uintptr_t)GetModuleHandle(NULL), json_uint_hex);
		//}
#if RDR3 || GTA5
		if (arrayData->GetAllocFlags() != parMemberArrayData::AllocFlags(0))
		{
			w.String("allocFlags", FlagsToString(arrayData->GetAllocFlags()));
		}
#endif
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
#if RDR3 || GTA5
		case parMemberArraySubtype::VIRTUAL:
#endif
			w.UInt("arraySize", arrayData->arraySize, json_uint_dec);
			break;
#if RDR3 || GTA5
		case parMemberArraySubtype::POINTER_WITH_COUNT:
		case parMemberArraySubtype::POINTER_WITH_COUNT_8BIT_IDX:
		case parMemberArraySubtype::POINTER_WITH_COUNT_16BIT_IDX:
			w.UInt("countOffset", arrayData->countOffset, json_uint_hex);
			break;
#endif
		}
	}
	break;
	case parMemberType::ENUM:
#if RDR3 || GTA5
	case parMemberType::BITSET:
#endif
	{
		auto* enumData = static_cast<parMemberEnumData*>(m);
#if RDR3 || GTA5
		w.UInt("enumName", enumData->enumData->name, json_uint_hex);
#elif GTA4
		// ENUM not used in GTA4
		w.UInt("enumName", 0xDEADBEEF, json_uint_hex);
#endif
		w.Int("initValue", enumData->initValue);
	}
	break;
#if RDR3 || GTA5
	case parMemberType::MAP:
	{
		auto* map = static_cast<parMemberMap*>(member);
		auto* mapData = static_cast<parMemberMapData*>(m);
		DumpJsonMember(w, "key", map->key);
		DumpJsonMember(w, "value", map->value);
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
#endif
	case parMemberType::STRING:
	{
		auto* stringData = static_cast<parMemberStringData*>(m);
		switch (static_cast<parMemberStringSubtype>(m->subType))
		{
		case parMemberStringSubtype::MEMBER:
#if RDR3 || GTA5
		case parMemberStringSubtype::WIDE_MEMBER:
#endif
			w.UInt("memberSize", stringData->memberSize, json_uint_dec);
			break;
#if RDR3 || GTA5
		case parMemberStringSubtype::ATNSHASHSTRING:
		case parMemberStringSubtype::ATNSHASHVALUE:
			w.UInt("namespaceIndex", stringData->GetNamespaceIndex(), json_uint_dec);
			break;
#endif
		}
	}
	break;
	// MATRIX34/44 not used in GTA4 (and initValues doesn't exist in GTA4, hardcoded to the identity matrix)
#if RDR3 || GTA5
	case parMemberType::MATRIX34:
	case parMemberType::MATRIX44:
	case parMemberType::MAT33V:
	case parMemberType::MAT34V:
	case parMemberType::MAT44V:
	{
		auto* matrixData = static_cast<parMemberMatrixData*>(m);
		w.BeginArray("initValues");
		for (auto v : matrixData->initValues)
		{
			w.Float(std::nullopt, v);
		}
		w.EndArray();
	}
	break;
#endif
	case parMemberType::VECTOR2:
	case parMemberType::VECTOR3:
	case parMemberType::VECTOR4:
#if RDR3 || GTA5
	case parMemberType::VEC2V:
	case parMemberType::VEC3V:
	case parMemberType::VEC4V:
	case parMemberType::VECBOOLV:
#if RDR3
	case parMemberType::VEC2F:
	case parMemberType::QUATV:
#endif
#endif
	{
		auto* vecData = static_cast<parMemberVectorData*>(m);
		w.BeginArray("initValues");
		for (auto v : vecData->initValues)
		{
			w.Float(std::nullopt, v);
		}
		w.EndArray();
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
#if RDR3 || GTA5
	case parMemberType::SCALARV:
	case parMemberType::BOOLV:
	case parMemberType::PTRDIFFT:
	case parMemberType::SIZET:
	case parMemberType::FLOAT16:
	case parMemberType::INT64:
	case parMemberType::UINT64:
	case parMemberType::DOUBLE:
#endif
	{
		auto* simpleData = static_cast<parMemberSimpleData*>(m);
#if RDR3
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

#if RDR3 || GTA5
	auto* d = structureToStaticData[s];
#endif

	w.BeginObject(key);
	{
#if RDR3 || GTA5
		if (d->nameStr != nullptr)
		{
			w.String("name", d->nameStr);
		}
		else
		{
			w.UInt("name", s->name, json_uint_hex);
		}
#elif GTA4
		w.String("name", s->name);
#endif
		if (s->baseStructure != nullptr)
		{
			w.BeginObject("base");
#if RDR3 || GTA5
			w.UInt("name", s->baseStructure->name, json_uint_hex);
#elif GTA4
			w.String("name", s->baseStructure->name);
#endif
			w.UInt("offset", s->baseOffset, json_uint_dec);
			w.EndObject();
		}
		w.UInt("size", s->structureSize, json_uint_dec);
		w.UInt("align", s->FindAlign(), json_uint_dec);
#if RDR3 || GTA5
		w.String("flags", FlagsToString(s->flags));
#elif GTA4
		w.String("flags", "");
#endif
		w.String("version", std::format("{}.{}", s->versionMajor, s->versionMinor));
		w.BeginArray("members");
		for (size_t i = 0; i < s->members.Count; i++)
		{
			auto* m = s->members.Items[i];
#if RDR3 || GTA5
			auto nameOverride = d->memberNames != nullptr ? std::make_optional(std::string_view(d->memberNames[i])) : std::nullopt;
#else
			auto nameOverride = std::nullopt;
#endif
			DumpJsonMember(w, std::nullopt, m, nameOverride);
		}
		w.EndArray();
		
#if RDR3 || GTA5
		if (s->extraAttributes != nullptr)
		{
			DumpJsonAttributeList(w, "extraAttributes", s->extraAttributes);
		}
#endif

		w.BeginObject("factories");
		if (s->factoryNew.func != nullptr)
		{
			w.UInt("new", (uintptr_t)s->factoryNew.func - (uintptr_t)GetModuleHandle(NULL), json_uint_hex_no_zero_pad);
		}
		else
		{
			w.Null("new");
		}
#if RDR3 || GTA5
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
#endif
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
	// no enums used in GTA4
#if RDR3 || GTA5
	w.UInt("name", e->name, json_uint_hex);
	w.String("flags", FlagsToString(e->flags));
	w.BeginArray("values");
	for (size_t i = 0; i < e->valueCount; i++)
	{
		auto& v = e->values[i];
		w.BeginObject();
		if (e->valueNames != nullptr)
		{
			w.String("name", e->valueNames[i]);
		}
		else
		{
			w.UInt("name", v.name, json_uint_hex);
		}
		w.Int("value", v.value);
		w.EndObject();
	}
	w.EndArray();
#endif
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
#if RDR3
	w.String("game", "rdr3");
#elif GTA5
	w.String("game", "gta5");
#elif GTA4
	w.String("game", "gta4");
#endif
	auto [major, minor, build, revision] = GetGameBuild();
#if RDR3 || GTA5
	w.String("build", std::format("{}", build));
#elif GTA4
	w.String("build", std::format("{}.{}.{}.{}", major, minor, build, revision));
#endif
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


#if RDR3 || GTA5
static void(*rage__parStructure__BuildStructureFromStaticData_orig)(parStructure* This, parStructureStaticData* staticData);
static void rage__parStructure__BuildStructureFromStaticData_detour(parStructure* This, parStructureStaticData* staticData)
{
	structureToStaticData[This] = staticData;
	
	rage__parStructure__BuildStructureFromStaticData_orig(This, staticData);
}
#endif

static DWORD WINAPI Main()
{
	spdlog::set_default_logger(spdlog::basic_logger_mt("file_logger", "DumpStructs.log"));
	spdlog::info("Initializing...");
	
#if RDR3 || GTA5
	void* rage__parStructure__BuildStructureFromStaticData =
#if RDR3
		hook::get_pattern("89 41 30 41 BF ? ? ? ? 4D 85 F6 74 58", -0x24);
#elif GTA5
		hook::get_pattern("48 8B 05 ? ? ? ? 48 83 7A ? ? 48 8B FA 44 8A 60 5C 8B 02", -0x1D);
#endif

	MH_Initialize();
	MH_CreateHook(rage__parStructure__BuildStructureFromStaticData, &rage__parStructure__BuildStructureFromStaticData_detour, (void**)&rage__parStructure__BuildStructureFromStaticData_orig);
	MH_EnableHook(MH_ALL_HOOKS);
#endif

	FindParManager();

	spdlog::info("Initialization finished");spdlog::default_logger()->flush();

	Sleep(25'000);
	
	spdlog::info("*parManager::sm_Instance = {}", (void*)*parManager::sm_Instance); spdlog::default_logger()->flush();
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
