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

static uint16_t GetGameBuild()
{
	const char* exeName =
#if RDR3
		"RDR2.exe";
#else
		"GTA5.exe";
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
					return (verInfo->dwFileVersionLS >> 16) & 0xFFFF;
				}
			}
		}
	}

	return 0xFFFF;
}

static void FindParManager()
{
	spdlog::info("Searching parManager::sm_Instance...");
#if RDR3
	parManager::sm_Instance = hook::get_address<parManager**>(hook::get_pattern("48 8B 0D ? ? ? ? E8 ? ? ? ? 84 C0 74 29 48 8B 1D", 3));
#else
	parManager::sm_Instance = hook::get_address<parManager**>(hook::get_pattern("48 8B 0D ? ? ? ? 4C 89 74 24 ? 45 33 C0 48 8B D7 C6 44 24 ? ?", 3));
#endif
	spdlog::info("parManager::sm_Instance = {}", (void*)parManager::sm_Instance);
}

static void InitParManager()
{
#if RDR3

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

			entry = entry->next;
		}
	}

	return { std::move(structs), std::move(enums) };
}

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
	if (m->extraData != 0 && m->type != parMemberType::ARRAY && m->type != parMemberType::STRING)
	{
		w.UInt("extraData", m->extraData, json_uint_hex);
	}
	w.String("type", EnumToString(m->type));
	w.String("subtype", SubtypeToStr(m->type, m->subType));
	if (m->attributes != nullptr)
	{
		DumpJsonAttributeList(w, "attributes", m->attributes);
	}
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
		if (arrayData->GetAllocFlags() != parMemberArrayData::AllocFlags(0))
		{
			w.String("allocFlags", FlagsToString(arrayData->GetAllocFlags()));
		}
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
	case parMemberType::VECTOR2:
	case parMemberType::VECTOR3:
	case parMemberType::VECTOR4:
	case parMemberType::VEC2V:
	case parMemberType::VEC3V:
	case parMemberType::VEC4V:
	case parMemberType::VECBOOLV:
	case parMemberType::VEC2F:
	case parMemberType::QUATV:
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

		if (s->extraAttributes != nullptr)
		{
			DumpJsonAttributeList(w, "extraAttributes", s->extraAttributes);
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
#if RDR3
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

static void(*rage__parStructure__BuildStructureFromStaticData_orig)(parStructure* This, parStructureStaticData* staticData);
static void rage__parStructure__BuildStructureFromStaticData_detour(parStructure* This, parStructureStaticData* staticData)
{
	structureToStaticData[This] = staticData;
	
	rage__parStructure__BuildStructureFromStaticData_orig(This, staticData);
}

static DWORD WINAPI Main()
{
	spdlog::set_default_logger(spdlog::basic_logger_mt("file_logger", "DumpStructs.log"));
	spdlog::info("Initializing...");

	void* rage__parStructure__BuildStructureFromStaticData =
#if RDR3
		hook::get_pattern("89 41 30 41 BF ? ? ? ? 4D 85 F6 74 58", -0x24);
#else
		hook::get_pattern("48 8B 05 ? ? ? ? 48 83 7A ? ? 48 8B FA 44 8A 60 5C 8B 02", -0x1D);
#endif

	MH_Initialize();
	MH_CreateHook(rage__parStructure__BuildStructureFromStaticData, &rage__parStructure__BuildStructureFromStaticData_detour, (void**)&rage__parStructure__BuildStructureFromStaticData_orig);
	MH_EnableHook(MH_ALL_HOOKS);

	FindParManager();

	spdlog::info("Initialization finished");

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
