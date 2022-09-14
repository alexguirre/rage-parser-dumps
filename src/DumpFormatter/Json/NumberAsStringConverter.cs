using DumpFormatter.Model;

using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DumpFormatter.Json;

internal class NumberAsStringConverter : JsonConverter<string>
{
    public override string Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.Number) { throw new JsonException(); }

        return Encoding.UTF8.GetString(reader.ValueSpan);
    }

    public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
        => writer.WriteRawValue(value);
}
