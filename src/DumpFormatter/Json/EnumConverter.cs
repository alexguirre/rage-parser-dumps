using DumpFormatter.Model;

using System.Text.Json;
using System.Text.Json.Serialization;

namespace DumpFormatter.Json;

internal class EnumConverter<T> : JsonConverter<T> where T : struct, Enum
{
    public override T Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var str = reader.GetString();
        if (string.IsNullOrEmpty(str))
        {
            return default;
        }
        return Enum.Parse<T>(str);
    }

    public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options)
        => writer.WriteStringValue(value.ToString());
}
