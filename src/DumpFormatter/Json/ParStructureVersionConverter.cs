using DumpFormatter.Model;

using System.Text.Json;
using System.Text.Json.Serialization;

namespace DumpFormatter.Json;

internal class ParStructureVersionConverter : JsonConverter<ParStructureVersion>
{
    public override ParStructureVersion Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var str = reader.GetString();
        if (string.IsNullOrEmpty(str))
        {
            return default;
        }
        var parts = str.Split('.');
        if (parts.Length != 2)
        {
            return default;
        }
        return new(uint.Parse(parts[0]), uint.Parse(parts[1]));
    }

    public override void Write(Utf8JsonWriter writer, ParStructureVersion value, JsonSerializerOptions options)
        => writer.WriteStringValue(value.ToString());
}
