using DumpFormatter.Json;
using DumpFormatter.Model;

using System.Collections.Immutable;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Xml.Linq;

namespace DumpFormatter.Formatters;

internal class JsonTreeFormatter : IDumpFormatter
{
    private record Tree(List<StructNode> Structs, List<Node> Enums);
    private class Node
    {
        public string Name { get; init; } = "";
        public string? Markup { get; init; }
        public List<string>? Usage { get; set; }
    }
    private class StructNode : Node
    {
        public ulong Size { get; init; }
        public ulong Align { get; init; }
        public ParStructureVersion? Version { get; init; }
        public List<Field>? Fields { get; init; }
        public List<StructNode>? Children { get; set; }
        public string? Xml { get; init; }
    };
    private record Field(string Name, ulong Offset, ulong Size, ulong Align, ParMemberType Type, ParMemberSubtype Subtype);

    public virtual void Format(TextWriter writer, ParDump dump)
    {
        var structsRoot = new StructNode() { Name = "__root", Children = new() };
        var enums = new List<Node>();
        var nodeDict = new Dictionary<uint, StructNode>();
        foreach (var s in dump.Structs.OrderBy(s => s.Name.ToFormattedString()))
        {
            addStructToTree(s);
        }
        foreach (var e in dump.Enums.OrderBy(s => s.Name.ToFormattedString()))
        {
            addEnumToTree(e);
        }

        var tree = new Tree(structsRoot.Children, enums);
        var opt = new JsonSerializerOptions(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
        writer.Write(JsonSerializer.Serialize(tree, opt));

        StructNode addStructToTree(ParStructure structure)
        {
            if (nodeDict!.TryGetValue(structure.Name.Hash, out var n))
            {
                return n;
            }
            else
            {
                var parent = structsRoot!;
                if (structure.Base != null)
                {
                    parent = addStructToTree(dump.Structs.First(s => s.Name == structure.Base.Value.Name));
                }

                var node = new StructNode
                {
                    Name = structure.Name.ToFormattedString(),
                    Size = structure.Size,
                    Align = structure.Align,
                    Version = structure.Version != new ParStructureVersion(0, 0) ? structure.Version : null,
                    Fields = GetStructFields(dump, structure),
                    Markup = GetStructMarkup(dump, structure),
                    Usage = GetStructUsage(dump, structure),
                    Xml = GetStructXmlMarkup(dump, structure),
                };
                parent.Children ??= new();
                parent.Children.Add(node);
                nodeDict.Add(structure.Name.Hash, node);
                return node;
            }
        }

        Node addEnumToTree(ParEnum e)
        {
            var node = new Node
            {
                Name = e.Name.ToFormattedString(),
                Markup = GetEnumMarkup(dump, e),
                Usage = GetEnumUsage(dump, e),
            };
            enums!.Add(node);
            return node;
        }
    }

    private static List<Field>? GetStructFields(ParDump dump, ParStructure structure)
    {
        return structure.Members.IsDefaultOrEmpty ?
                null :
                structure.Members
                         .Select((m, i) => new Field(m.Name.ToFormattedString(), m.Offset, m.Size, m.Align, m.Type, m.Subtype))
                         .ToList();
    }

    private static List<string>? GetStructUsage(ParDump dump, ParStructure structure)
    {
        List<string>? usage = null;
        bool tryAddUsage(ParStructure s, ParMember m)
        {
            if (m.Type == ParMemberType.STRUCT)
            {
                if (((ParMemberStruct)m).StructName == structure.Name)
                {
                    usage ??= new();
                    usage.Add(s.Name.ToFormattedString());
                    return true;
                }
            }

            return false;
        }

        foreach (var s in dump.Structs)
        {
            foreach (var m in s.Members)
            {
                if (tryAddUsage(s, m))
                {
                    break; // already found a member using this type, don't need to check more members of this struct
                }
                else if (m.Type == ParMemberType.ARRAY)
                {
                    var arr = (ParMemberArray)m;
                    if (tryAddUsage(s, arr.Item)) { break; }
                }
                else if (m.Type == ParMemberType.MAP)
                {
                    var map = (ParMemberMap)m;
                    if (tryAddUsage(s, map.Key) || tryAddUsage(s, map.Value)) { break; }
                }
            }
        }
        return usage;
    }

    private static List<string>? GetEnumUsage(ParDump dump, ParEnum e)
    {
        List<string>? usage = null;
        bool tryAddUsage(ParStructure s, ParMember m)
        {
            if (m.Type == ParMemberType.ENUM || m.Type == ParMemberType.BITSET)
            {
                if (((ParMemberEnum)m).EnumName == e.Name)
                {
                    usage ??= new();
                    usage.Add(s.Name.ToFormattedString());
                    return true;
                }
            }

            return false;
        }

        foreach (var s in dump.Structs)
        {
            foreach (var m in s.Members)
            {
                if (tryAddUsage(s, m))
                {
                    break; // already found a member using this type, don't need to check more members of this struct
                }
                else if (m.Type == ParMemberType.ARRAY)
                {
                    var arr = (ParMemberArray)m;
                    if (tryAddUsage(s, arr.Item)) { break; }
                }
                else if (m.Type == ParMemberType.MAP)
                {
                    var map = (ParMemberMap)m;
                    if (tryAddUsage(s, map.Key) || tryAddUsage(s, map.Value)) { break; }
                }
            }
        }
        return usage;
    }

    public string GetStructMarkup(ParDump dump, ParStructure s)
    {
        var sb = new StringBuilder();
        sb.Append($"{Keyword("struct")} ={Type(s.Name.ToFormattedString())}");
        if (s.Base != null)
        {
            sb.Append($" : {Type(s.Base.Value.Name.ToFormattedString())}");
        }
        sb.AppendLine();
        sb.AppendLine("{");
        var membersOrdered = s.Members.Select((m, i) => (Member: m, Index: i)).OrderBy(m => m.Member.Offset).ToArray();
        for (int i = 0; i < membersOrdered.Length; i++)
        {
            var member = membersOrdered[i].Member;
            sb.Append('\t');
            FormatMemberType(sb, member);
            sb.Append(' ');
            sb.Append(member.Name.ToFormattedString());
            sb.Append(';');
            sb.AppendLine();
        }
        sb.AppendLine("};");
        return sb.ToString();

        static void FormatMemberType(StringBuilder sb, ParMember m)
        {
            formatRecursive(sb, m);

            static void formatRecursive(StringBuilder sb, ParMember m)
            {
                sb.Append(Keyword(TypeToString(m.Type)));
                switch (m.Type)
                {
                    case ParMemberType.STRUCT:
                        sb.Append(' ');
                        var structName = ((ParMemberStruct)m).StructName;
                        sb.Append(structName != null ? Type(structName.Value.ToFormattedString()) : Keyword("void"));
                        if (m.Subtype != ParMemberSubtype.STRUCTURE)
                        {
                            sb.Append("*");
                        }
                        break;
                    case ParMemberType.ENUM:
                        sb.Append(' ');
                        sb.Append(Type(((ParMemberEnum)m).EnumName.ToFormattedString()));
                        break;
                    case ParMemberType.BITSET:
                        sb.Append('<');
                        sb.Append(Keyword("enum"));
                        sb.Append(' ');
                        sb.Append(Type(((ParMemberEnum)m).EnumName.ToFormattedString()));
                        sb.Append('>');
                        break;
                    case ParMemberType.ARRAY:
                        sb.Append('<');
                        var arr = (ParMemberArray)m;
                        formatRecursive(sb, arr.Item);
                        if (arr.ArraySize.HasValue)
                        {
                            sb.Append($", {arr.ArraySize.Value}");
                        }
                        sb.Append('>');
                        break;
                    case ParMemberType.MAP:
                        sb.Append('<');
                        formatRecursive(sb, ((ParMemberMap)m).Key);
                        sb.Append(", ");
                        formatRecursive(sb, ((ParMemberMap)m).Value);
                        sb.Append('>');
                        break;
                }
            }
        }

        static string TypeToString(ParMemberType type)
            => type switch
            {
                ParMemberType.BOOL => "bool",
                ParMemberType.CHAR => "char",
                ParMemberType.UCHAR => "uchar",
                ParMemberType.SHORT => "short",
                ParMemberType.USHORT => "ushort",
                ParMemberType.INT => "int",
                ParMemberType.UINT => "uint",
                ParMemberType.FLOAT => "float",
                ParMemberType.VECTOR2 => "Vector2",
                ParMemberType.VECTOR3 => "Vector3",
                ParMemberType.VECTOR4 => "Vector4",
                ParMemberType.STRING => "string",
                ParMemberType.STRUCT => "struct",
                ParMemberType.ARRAY => "array",
                ParMemberType.ENUM => "enum",
                ParMemberType.BITSET => "bitset",
                ParMemberType.MAP => "map",
                ParMemberType.MATRIX34 => "Matrix34",
                ParMemberType.MATRIX44 => "Matrix44",
                ParMemberType.VEC2V => "Vec2V",
                ParMemberType.VEC3V => "Vec3V",
                ParMemberType.VEC4V => "Vec4V",
                ParMemberType.MAT33V => "Mat33V",
                ParMemberType.MAT34V => "Mat34V",
                ParMemberType.MAT44V => "Mat44V",
                ParMemberType.SCALARV => "ScalarV",
                ParMemberType.BOOLV => "BoolV",
                ParMemberType.VECBOOLV => "VecBoolV",
                ParMemberType.PTRDIFFT => "ptrdiff_t",
                ParMemberType.SIZET => "size_t",
                ParMemberType.FLOAT16 => "float16",
                ParMemberType.INT64 => "int64",
                ParMemberType.UINT64 => "uint64",
                ParMemberType.DOUBLE => "double",
                ParMemberType.GUID => "guid",
                ParMemberType.VEC2F => "Vec2f",
                ParMemberType.QUATV => "QuatV",
                _ => "UNKNOWN",
            };
    }

    public string GetEnumMarkup(ParDump dump, ParEnum e)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"{Keyword("enum")} ={Type(e.Name.ToFormattedString())}");
        sb.AppendLine("{");
        for (int i = 0; i < e.Values.Length; i++)
        {
            var value = e.Values[i];
            sb.AppendLine($"\t{value.Name.ToFormattedString()} = {value.Value},");
        }
        sb.AppendLine("};");
        return sb.ToString();
    }

    private static string Keyword(string str) => $"${str}$";
    private static string Type(string str) => $"@{str}@";

    public string GetStructXmlMarkup(ParDump dump, ParStructure root)
    {
        var sb = new StringBuilder();
        int depth = 0;
        Struct(root);
        return sb.ToString();

        void Struct(ParStructure s, string? elementName = null, bool addTypeAttribute = false)
        {
            Debug.Assert(sb != null);

            elementName ??= s.Name.ToFormattedString();

            Indent();
            depth++;
            var members = s.Members.AsEnumerable();
            {
                var tmp = s;
                while (tmp.Base != null)
                {
                    var baseStruc = dump.Structs.First(st => st.Name == tmp.Base.Value.Name);
                    members = baseStruc.Members.Concat(members);
                    tmp = baseStruc;
                }
            }
            sb.Append($"<{elementName}");
            if (addTypeAttribute)
            {
                sb.Append($" {Attr("type")}={Str(s.Name.ToFormattedString())}");
            }
            sb.AppendLine(">");
            foreach (var m in members)
            {
                Field(m);
            }
            depth--;
            Indent();
            sb.AppendLine($"</{elementName}>");
        }

        void Field(ParMember m)
        {
            Debug.Assert(sb != null);

            if (m.Type != ParMemberType.STRUCT)
            {
                Indent();
            }
            switch (m.Type)
            {
                case ParMemberType.FLOAT:
                case ParMemberType.FLOAT16:
                case ParMemberType.DOUBLE:
                    sb.AppendLine($"<{m.Name} {Attr("value")}={FloatStr(((ParMemberSimple)m).InitValue)} />");
                    break;
                case ParMemberType.CHAR:
                case ParMemberType.UCHAR:
                case ParMemberType.SHORT:
                case ParMemberType.USHORT:
                case ParMemberType.INT:
                case ParMemberType.UINT:
                case ParMemberType.INT64:
                case ParMemberType.UINT64:
                case ParMemberType.PTRDIFFT:
                case ParMemberType.SIZET:
                    sb.AppendLine($"<{m.Name} {Attr("value")}={IntStr(((ParMemberSimple)m).InitValue)} />");
                    break;
                case ParMemberType.BOOL:
                    sb.AppendLine($"<{m.Name} {Attr("value")}={BoolStr(((ParMemberSimple)m).InitValue)} />");
                    break;
                case ParMemberType.STRING:
                    var stringContents = "String";
                    var initValueAttr = m.Attributes?.List.FirstOrDefault(attr => attr.Name == "initValue"); // TODO: GTA5 also uses initHashValue
                    if (initValueAttr?.Type == ParAttributeType.String)
                    {
                        stringContents = initValueAttr.Value.ToString();
                    }
                    sb.AppendLine($"<{m.Name}>{stringContents}</{m.Name}>");
                    break;
                case ParMemberType.VEC2V:
                case ParMemberType.VECTOR2:
                case ParMemberType.VEC2F:
                case ParMemberType.VEC3V:
                case ParMemberType.VECTOR3:
                case ParMemberType.VEC4V:
                case ParMemberType.VECTOR4:
                case ParMemberType.QUATV:
                    var mv = (ParMemberVector)m;
                    sb.Append($"<{m.Name} {Attr("x")}={FloatStr(mv.InitValues[0])}");
                    if (mv.NumComponents >= 2) { sb.Append($" {Attr("y")}={FloatStr(mv.InitValues[1])}"); }
                    if (mv.NumComponents >= 3) { sb.Append($" {Attr("z")}={FloatStr(mv.InitValues[2])}"); }
                    if (mv.NumComponents >= 4) { sb.Append($" {Attr("w")}={FloatStr(mv.InitValues[3])}"); }
                    sb.AppendLine(" />");
                    break;
                case ParMemberType.VECBOOLV:
                    var mvb = (ParMemberVector)m;
                    sb.AppendLine($"<{m.Name} {Attr("x")}={BoolStr(mvb.InitValues[0])} {Attr("y")}={BoolStr(mvb.InitValues[1])} {Attr("z")}={BoolStr(mvb.InitValues[2])} {Attr("w")}={BoolStr(mvb.InitValues[3])} />");
                    break;
                case ParMemberType.MAT33V:
                case ParMemberType.MAT34V:
                    var mm = (ParMemberMatrix)m;
                    sb.AppendLine($"<{m.Name} {Attr("content")}={Str(m.Type == ParMemberType.MAT33V ? "matrix33" : "matrix34")}>");
                    depth++;
                    Indent(); sb.AppendLine($"{Float(mm.InitValues[0])}\t{Float(mm.InitValues[4])}\t{Float(mm.InitValues[8])}");
                    Indent(); sb.AppendLine($"{Float(mm.InitValues[1])}\t{Float(mm.InitValues[5])}\t{Float(mm.InitValues[9])}");
                    Indent(); sb.AppendLine($"{Float(mm.InitValues[2])}\t{Float(mm.InitValues[6])}\t{Float(mm.InitValues[10])}");
                    if (m.Type == ParMemberType.MAT34V)
                    {
                        Indent(); sb.AppendLine($"{Float(mm.InitValues[3])}\t{Float(mm.InitValues[7])}\t{Float(mm.InitValues[11])}");
                    }
                    depth--;
                    Indent();
                    sb.AppendLine($"</{m.Name}>");
                    break;
                case ParMemberType.MAT44V:
                    var mm2 = (ParMemberMatrix)m;
                    sb.AppendLine($"<{m.Name} {Attr("content")}={Str("matrix44")}>");
                    depth++;
                    Indent(); sb.AppendLine($"{Float(mm2.InitValues[0])}\t{Float(mm2.InitValues[4])}\t{Float(mm2.InitValues[8])}\t{Float(mm2.InitValues[12])}");
                    Indent(); sb.AppendLine($"{Float(mm2.InitValues[1])}\t{Float(mm2.InitValues[5])}\t{Float(mm2.InitValues[9])}\t{Float(mm2.InitValues[13])}");
                    Indent(); sb.AppendLine($"{Float(mm2.InitValues[2])}\t{Float(mm2.InitValues[6])}\t{Float(mm2.InitValues[10])}\t{Float(mm2.InitValues[14])}");
                    Indent(); sb.AppendLine($"{Float(mm2.InitValues[3])}\t{Float(mm2.InitValues[7])}\t{Float(mm2.InitValues[11])}\t{Float(mm2.InitValues[15])}");
                    depth--;
                    Indent();
                    sb.AppendLine($"</{m.Name}>");
                    break;
                //case ParMemberType.MATRIX34:
                //case ParMemberType.MATRIX44:
                //    throw new NotImplementedException();
                default:
                    sb.AppendLine($"<{m.Name} />");
                    break;
                case ParMemberType.STRUCT:
                    var ms = (ParMemberStruct)m;
                    var struc = ms.StructName == null ? null : dump.Structs.First(st => st.Name == ms.StructName);
                    switch (m.Subtype)
                    {
                        case ParMemberSubtype.EXTERNAL_NAMED:
                        case ParMemberSubtype.EXTERNAL_NAMED_USERNULL:
                            Indent();
                            sb.AppendLine($"<{m.Name} {Attr("ref")}={Str("INSTANCE_NAME")} />");
                            break;
                        case ParMemberSubtype.POINTER:
                        case ParMemberSubtype.SIMPLE_POINTER:
                            if (depth >= 5)
                            {
                                Indent();
                                sb.AppendLine($"<{m.Name} />"); // if we are too deep, don't generate anymore XML to avoid stackoverflows due to circular references
                            }
                            else
                            {
                                Debug.Assert(struc != null);
                                Struct(struc, m.Name.ToFormattedString(), addTypeAttribute: true); // TODO: do SIMPLE_POINTERs include the type attribute?
                            }
                            break;
                        default:
                            Debug.Assert(struc != null);
                            Struct(struc, m.Name.ToFormattedString());
                            break;
                    }
                    break;
                case ParMemberType.ENUM:
                    //case ParMemberType.BITSET: // TODO: BITSET initValue cannot be compared by equality, the enum values represents the bits
                    var me = (ParMemberEnum)m;
                    var @enum = dump.Enums.First(en => en.Name == me.EnumName);
                    var defaultValue = @enum.Values.FirstOrDefault(v => v.Value == me.InitValue);
                    if (defaultValue == default)
                    {
                        sb.AppendLine($"<{m.Name}>{me.InitValue}</{m.Name}>");
                    }
                    else
                    {
                        sb.AppendLine($"<{m.Name}>{defaultValue.Name}</{m.Name}>");
                    }
                    break;
                case ParMemberType.ARRAY:
                    sb.AppendLine($"<{m.Name}>");
                    depth++;
                    if (depth < 5)
                    {
                        Field(((ParMemberArray)m).Item);
                    }
                    depth--;
                    Indent();
                    sb.AppendLine($"</{m.Name}>");
                    break;
            }
        }

        void Indent() => sb!.Append('\t', depth);


        static string Bool(double v) => v == 0.0 ? "false" : "true";
        static string Int(double v) => v.ToString("0");
        static string Float(double v) => v.ToString("0.000000");

        static string BoolStr(double v) => Str(Bool(v));
        static string IntStr(double v) => Str(Int(v));
        static string FloatStr(double v) => Str(Float(v));

        static string Attr(string name) => $"${name}$";
        static string Str(string str) => $"s\"{str}\"s";
    }
}
