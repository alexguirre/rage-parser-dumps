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

#include "rage.h"
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
#if RDR3
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
