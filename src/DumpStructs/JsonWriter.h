#pragma once
#include <string_view>
#include <optional>
#include <fstream>
#include <format>

struct JsonUIntOptions
{
	bool hex;
	bool hexZeroPad;
};
constexpr JsonUIntOptions json_uint_dec{ false, false };
constexpr JsonUIntOptions json_uint_hex{ true, true };
constexpr JsonUIntOptions json_uint_hex_no_zero_pad{ true, false };

class JsonWriter
{
public:
	JsonWriter(std::string_view filePath);

	void Null(std::optional<std::string_view> key);
	void String(std::optional<std::string_view> key, std::string_view value);
	void Bool(std::optional<std::string_view> key, bool value);
	void Int(std::optional<std::string_view> key, std::signed_integral auto value);
	void UInt(std::optional<std::string_view> key, std::unsigned_integral auto value, JsonUIntOptions options);
	void Float(std::optional<std::string_view> key, float value);
	void Double(std::optional<std::string_view> key, double value);
	void BeginObject(std::optional<std::string_view> key = std::nullopt);
	void EndObject();
	void BeginArray(std::optional<std::string_view> key = std::nullopt);
	void EndArray();

private:
	void WriteKey(std::optional<std::string_view> key);
	void NextLine(bool addComma = true);
	void WriteIndent();
	void Indent();
	void Unindent();

	size_t _indent;
	std::ofstream _out;
	bool _skipComma;
};

void JsonWriter::Int(std::optional<std::string_view> key, std::signed_integral auto value)
{
	NextLine();
	WriteKey(key);
	_out << std::format("{}", value);
}

void JsonWriter::UInt(std::optional<std::string_view> key, std::unsigned_integral auto value, JsonUIntOptions options)
{
	NextLine();
	WriteKey(key);
	_out << (options.hex ? std::format("\"0x{:0{}X}\"", value, options.hexZeroPad ? (sizeof(value) * 2) : 1) :
						   std::format("{}", value));
}
