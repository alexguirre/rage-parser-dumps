#include "JsonWriter.h"
#include <cassert>
#include <string>
#include <array>
#include <charconv>

JsonWriter::JsonWriter(std::string_view filePath)
	: _indent{ 0 }, _out{ std::string{ filePath }, std::ios::out | std::ios::binary }, _skipComma{ true }, _first{ true }
{
}

void JsonWriter::Null(std::optional<std::string_view> key)
{
	NextLine();
	WriteKey(key);
	_out << "null";
}

void JsonWriter::String(std::optional<std::string_view> key, std::string_view value)
{
	NextLine();
	WriteKey(key);
	_out << std::format("\"{}\"", value);
}

void JsonWriter::Bool(std::optional<std::string_view> key, bool value)
{
	NextLine();
	WriteKey(key);
	_out << (value ? "true" : "false");
}

void JsonWriter::Float(std::optional<std::string_view> key, float value)
{
	std::array<char, 256> buff;
	auto [ptr, ec] = std::to_chars(buff.data(), buff.data() + buff.size(), value, std::chars_format::fixed);

	NextLine();
	WriteKey(key);
	_out << std::string_view{ buff.data(), ptr };
}

void JsonWriter::Double(std::optional<std::string_view> key, double value)
{
	std::array<char, 256> buff;
	auto [ptr, ec] = std::to_chars(buff.data(), buff.data() + buff.size(), value, std::chars_format::fixed);

	NextLine();
	WriteKey(key);
	_out << std::string_view{ buff.data(), ptr };
}

void JsonWriter::BeginObject(std::optional<std::string_view> key)
{
	NextLine();
	WriteKey(key);
	_out << '{';
	_skipComma = true;
	Indent();
}

void JsonWriter::EndObject()
{
	Unindent();
	NextLine(false);
	_out << '}';
}

void JsonWriter::BeginArray(std::optional<std::string_view> key)
{
	NextLine();
	WriteKey(key);
	_out << '[';
	_skipComma = true;
	Indent();
}

void JsonWriter::EndArray()
{
	Unindent();
	NextLine(false);
	_out << ']';
}

void JsonWriter::WriteKey(std::optional<std::string_view> key)
{
	if (key.has_value())
	{
		_out << std::format("\"{}\": ", key.value());
	}
}

void JsonWriter::NextLine(bool addComma)
{
	if (_first)
	{
		// prevent empty new-line at the start
		_first = false;
		return;
	}

	if (!_skipComma && addComma)
	{
		_out << ',';
	}
	_skipComma = false;
	_out << '\n';
	WriteIndent();
}

void JsonWriter::WriteIndent()
{
	for (size_t n = 0; n < _indent; ++n)
	{
		_out << '\t';
	}
}

void JsonWriter::Indent()
{
	_indent++;
}

void JsonWriter::Unindent()
{
	assert(_indent > 0);
	_indent--;
}
