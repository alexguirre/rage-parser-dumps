using DumpFormatter.Model;

using System.ComponentModel.DataAnnotations;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DumpFormatter.Json;

internal class ParMemberConverter : JsonConverter<ParMember>
{
    public override bool CanConvert(Type typeToConvert) => typeof(ParMember).IsAssignableFrom(typeToConvert);

    public override ParMember Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var memberUnified = JsonSerializer.Deserialize<ParMemberUnified>(ref reader, options);
        return memberUnified?.ToConcreteMember() ?? throw new JsonException();
    }

    public override void Write(Utf8JsonWriter writer, ParMember value, JsonSerializerOptions options)
        => throw new NotImplementedException();

    /// <summary>
    /// Used to represent a ParMember while reading the JSON. It contains all possible properties of a ParMember and its derived types and
    /// can be converted to a concrete ParMember type based on Type/Subtype.
    /// </summary>
    private sealed record ParMemberUnified(
        Name Name,
        [property: JsonConverter(typeof(HexConverter))] ulong Offset,
        [property: JsonConverter(typeof(HexConverter))] ulong Flags1,
        [property: JsonConverter(typeof(HexConverter))] ulong Flags2,
        [property: JsonConverter(typeof(HexConverter))] ulong ExtraData,
        ParMemberType Type,
        ParMemberSubtype Subtype,
        ParAttributeList? Attributes,
        // ParMemberSimple
        [property: JsonConverter(typeof(NumberAsStringConverter))] string InitValue,
        // ParMemberVector/ParMemberMatrix
        double[] InitValues,
        // ParMemberString
        ulong MemberSize,
        byte NamespaceIndex,
        // ParMemberArray
        ParMemberUnified? Item,
        ParMemberArrayAllocFlags AllocFlags,
        ulong? ArraySize,
        [property: JsonConverter(typeof(HexConverter))] ulong? CountOffset,
        // ParMemberEnum
        Name EnumName,
        // ParMemberMap
        ParMemberUnified? Key,
        ParMemberUnified? Value,
        Pointer? CreateIteratorFunc,
        Pointer? CreateInterfaceFunc,
        // ParMemberStruct
        Name? StructName,
        Pointer? ExternalNamedResolveFunc,
        Pointer? ExternalNamedGetNameFunc,
        Pointer? AllocateStructFunc)
    {
        public ParMember ToConcreteMember()
            => Type switch
            {
                ParMemberType.BOOL or
                ParMemberType.CHAR or
                ParMemberType.UCHAR or
                ParMemberType.SHORT or
                ParMemberType.USHORT or
                ParMemberType.INT or
                ParMemberType.UINT or
                ParMemberType.FLOAT or
                ParMemberType.SCALARV or
                ParMemberType.BOOLV or
                ParMemberType.PTRDIFFT or
                ParMemberType.SIZET or
                ParMemberType.FLOAT16 or
                ParMemberType.INT64 or
                ParMemberType.UINT64 or
                ParMemberType.DOUBLE => new ParMemberSimple(Name, Offset, Flags1, Flags2, ExtraData, Type, Subtype, Attributes, double.Parse(InitValue)),

                ParMemberType.VECTOR2 or
                ParMemberType.VECTOR3 or
                ParMemberType.VECTOR4 or
                ParMemberType.VEC2V or
                ParMemberType.VEC3V or
                ParMemberType.VEC4V or
                ParMemberType.VECBOOLV or
                ParMemberType._0xFE5A582C or 
                ParMemberType.QUATV => new ParMemberVector(Name, Offset, Flags1, Flags2, ExtraData, Type, Subtype, Attributes, InitValues),

                ParMemberType.MATRIX34 or
                ParMemberType.MATRIX44 or
                ParMemberType.MAT33V or
                ParMemberType.MAT34V or
                ParMemberType.MAT44V => new ParMemberMatrix(Name, Offset, Flags1, Flags2, ExtraData, Type, Subtype, Attributes, InitValues),

                ParMemberType.STRING => new ParMemberString(Name, Offset, Flags1, Flags2, ExtraData, Type, Subtype, Attributes, MemberSize, NamespaceIndex),

                ParMemberType.ENUM or
                ParMemberType.BITSET => new ParMemberEnum(Name, Offset, Flags1, Flags2, ExtraData, Type, Subtype, Attributes, EnumName, ulong.Parse(InitValue)),

                ParMemberType.ARRAY => new ParMemberArray(Name, Offset, Flags1, Flags2, ExtraData, Type, Subtype, Attributes, Item!.ToConcreteMember(), AllocFlags, ArraySize, CountOffset),

                ParMemberType.MAP => new ParMemberMap(Name, Offset, Flags1, Flags2, ExtraData, Type, Subtype, Attributes, Key!.ToConcreteMember(), Value!.ToConcreteMember(), CreateIteratorFunc, CreateInterfaceFunc),

                ParMemberType.STRUCT => new ParMemberStruct(Name, Offset, Flags1, Flags2, ExtraData, Type, Subtype, Attributes, StructName, ExternalNamedResolveFunc, ExternalNamedGetNameFunc, AllocateStructFunc),

                _ => new ParMember(Name, Offset, Flags1, Flags2, ExtraData, Type, Subtype, Attributes),
            };
    }
}
