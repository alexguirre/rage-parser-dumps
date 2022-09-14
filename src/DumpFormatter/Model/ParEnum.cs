using DumpFormatter.Json;

using System.Collections.Immutable;
using System.Text.Json.Serialization;

namespace DumpFormatter.Model;

[Flags, JsonConverter(typeof(EnumConverter<ParEnumFlags>))]
internal enum ParEnumFlags : ushort
{
    ENUM_STATIC = 1 << 0,
    ENUM_HAS_NAMES = 1 << 1,
    ENUM_ALWAYS_HAS_NAMES = 1 << 2,
}

internal readonly record struct ParEnumValue(
    Name Name,
    ulong Value);

internal record ParEnum(
    Name Name,
    ParEnumFlags Flags,
    ParEnumValue[] Values,
    ImmutableArray<string> ValueNames);
