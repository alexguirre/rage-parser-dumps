using DumpFormatter.Model;

using System.Text.Json;
using System.Text.Json.Serialization;

namespace DumpFormatter.Json;

internal class HexConverter : JsonConverter<ulong>
{
    public override ulong Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => ulong.Parse(reader.GetString()![2..], System.Globalization.NumberStyles.HexNumber);

    public override void Write(Utf8JsonWriter writer, ulong value, JsonSerializerOptions options)
        => writer.WriteStringValue($"0x{value:X}");
}
