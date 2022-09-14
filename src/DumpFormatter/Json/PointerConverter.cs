using DumpFormatter.Model;

using System.Text.Json;
using System.Text.Json.Serialization;

namespace DumpFormatter.Json;

internal class PointerConverter : JsonConverter<Pointer>
{
    public override Pointer Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => new(ulong.Parse(reader.GetString()![2..], System.Globalization.NumberStyles.HexNumber));

    public override void Write(Utf8JsonWriter writer, Pointer value, JsonSerializerOptions options)
        => writer.WriteStringValue(value.ToString());
}
