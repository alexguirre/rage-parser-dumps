using DumpFormatter.Json;

using System.Collections.Immutable;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace DumpFormatter.Model;

[JsonConverter(typeof(EnumConverter<ParAttributeType>))]
internal enum ParAttributeType : ushort
{
    String = 0,
    Int64 = 1,
    Double = 2,
    Bool = 3,
}

internal record ParAttribute(
    string Name,
    ParAttributeType Type,
    JsonValue Value);

internal record ParAttributeList(
    byte UserData1,
    byte UserData2,
    ParAttribute[] List);
