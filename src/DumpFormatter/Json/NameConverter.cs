using DumpFormatter.Model;

using System.Text.Json;
using System.Text.Json.Serialization;

namespace DumpFormatter.Json;

internal class NameConverter : JsonConverter<Name>
{
    public override Name Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => new(uint.Parse(reader.GetString()![2..], System.Globalization.NumberStyles.HexNumber));

    public override void Write(Utf8JsonWriter writer, Name value, JsonSerializerOptions options)
        => writer.WriteStringValue($"0x{value.Hash:X08}");
}
