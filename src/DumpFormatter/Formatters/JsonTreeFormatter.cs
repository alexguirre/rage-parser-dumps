using DumpFormatter.Model;

using System.Collections.Immutable;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DumpFormatter.Formatters;

internal class JsonTreeFormatter : IDumpFormatter
{
    private record Tree(StructNode Structs, List<string> Enums);
    private class StructNode
    {
        public string Name { get; init; } = "";
        public ulong Size { get; init; }
        public ulong Alignment { get; init; }
        public ParStructureVersion Version { get; init; }
        public string Markup { get; init; }
        public List<string>? Usage { get; set; }
        public List<StructNode>? Children { get; set; }
    };

    public virtual void Format(TextWriter writer, ParDump dump)
    {
        var tree = new Tree(new() { Name = "__root" }, new());
        var root = tree.Structs;
        var nodeDict = new Dictionary<uint, StructNode>();
        foreach (var s in dump.Structs.OrderBy(s => s.Name.ToString()))
        {
            addStructToTree(s);
        }
        foreach (var e in dump.Enums.OrderBy(s => s.Name.ToString()))
        {
            tree.Enums.Add(e.Name.ToString());
        }

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
                var parent = root!;
                if (structure.Base != null)
                {
                    parent = addStructToTree(dump.Structs.First(s => s.Name == structure.Base.Value.Name));
                }

                var node = new StructNode
                {
                    Name = structure.NameStr ?? structure.Name.ToString(),
                    Size = structure.Size,
                    Alignment = structure.Alignment,
                    Version = structure.Version,
                    Markup = GetStructMarkup(dump, structure),
                    Usage = GetUsage(dump, structure)
                };
                parent.Children ??= new();
                parent.Children.Add(node);
                nodeDict.Add(structure.Name.Hash, node);
                return node;
            }
        }
    }

    private static List<string>? GetUsage(ParDump dump, ParStructure structure)
    {
        List<string>? usage = null;
        bool tryAddUsage(ParStructure s, ParMember m)
        {
            if (m.Type == ParMemberType.STRUCT)
            {
                if (((ParMemberStruct)m).StructName == structure.Name)
                {
                    usage ??= new();
                    usage.Add(s.NameStr ?? s.Name.ToString());
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
        sb.Append($"{Keyword("struct")} ={Type(s.NameStr ?? s.Name.ToString())}");
        if (s.Base != null)
        {
            sb.Append($" : {Type(s.Base.Value.Name.ToString())}");
        }
        sb.AppendLine();
        sb.AppendLine("{");
        var memberNames = s.MemberNames;
        var membersOrdered = s.Members.Select((m, i) => (Member: m, Index: i)).OrderBy(m => m.Member.Offset).ToArray();
        for (int i = 0; i < membersOrdered.Length; i++)
        {
            var member = membersOrdered[i].Member;
            var name = !memberNames.IsDefaultOrEmpty ? memberNames[membersOrdered[i].Index] : member.Name.ToString();

            sb.Append('\t');
            FormatMemberType(sb, member);
            sb.Append(' ');
            sb.Append(name);
            sb.Append(';');
            sb.AppendLine();
        }
        sb.AppendLine("};");
        return sb.ToString();

        static string Keyword(string str) => $"${str}$";
        static string Type(string str) => $"@{str}@";

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
                        sb.Append(structName != null ? Type(structName.Value.ToString()) : Keyword("void"));
                        break;
                    case ParMemberType.ENUM:
                        sb.Append(' ');
                        sb.Append(Type(((ParMemberEnum)m).EnumName.ToString()));
                        break;
                    case ParMemberType.BITSET:
                        sb.Append('<');
                        sb.Append(Keyword("enum"));
                        sb.Append(' ');
                        sb.Append(Type(((ParMemberEnum)m).EnumName.ToString()));
                        sb.Append('>');
                        break;
                    case ParMemberType.ARRAY:
                        sb.Append('<');
                        formatRecursive(sb, ((ParMemberArray)m).Item);
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
                ParMemberType._0xFE5A582C => "_0xFE5A582C",
                ParMemberType.QUATV => "QuatV",
                _ => "UNKNOWN",
            };
    }
}
