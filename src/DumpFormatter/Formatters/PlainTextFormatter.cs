using DumpFormatter.Model;

using System.Diagnostics;
using System.Text;

namespace DumpFormatter.Formatters;

internal class PlainTextFormatter : IDumpFormatter
{
    private ParDump? dump;

    public virtual void Format(TextWriter writer, ParDump dump)
    {
        this.dump = dump;

        foreach (var s in dump.Structs.OrderBy(s => s.Name.ToString()))
        {
            FormatStruct(writer, s);
        }
        foreach (var e in dump.Enums.OrderBy(s => s.Name.ToString()))
        {
            FormatEnum(writer, e);
        }

        this.dump = null;
    }

    protected virtual void FormatStruct(TextWriter w, ParStructure s)
    {
        Debug.Assert(dump != null);

        w.Write($"struct {s.NameStr ?? s.Name.ToString()}");
        if (s.Base != null)
        {
            w.Write($" : {s.Base.Value.Name}");
        }
        w.WriteLine();
        w.WriteLine("{");
        var (paddingBetweenTypeAndName, paddingBetweenNameAndComment) = CalculatePaddingForMembers(s);
        var memberNames = s.MemberNames;
        var membersOrdered = s.Members.Select((m, i) => (Member: m, Index: i)).OrderBy(m => m.Member.Offset).ToArray();
        var membersSB = new StringBuilder();
        for (int i = 0; i < membersOrdered.Length; i++)
        {
            var member = membersOrdered[i].Member;
            var name = !memberNames.IsDefaultOrEmpty ? memberNames[membersOrdered[i].Index] : member.Name.ToString();

            membersSB.Append('\t');
            FormatMemberType(membersSB, member, out var typeLength);
            membersSB.Append(' ', paddingBetweenTypeAndName - typeLength);
            membersSB.Append(' ');
            membersSB.Append(name);
            membersSB.Append(';');
            membersSB.Append(' ', paddingBetweenNameAndComment - name.Length - 1);
            FormatMemberComment(membersSB, member);
            membersSB.AppendLine();
        }
        w.Write(membersSB);
        w.WriteLine("};");
        w.WriteLine();
    }

    protected virtual void FormatEnum(TextWriter w, ParEnum e)
    {
        w.WriteLine($"enum {e.Name}");
        w.WriteLine("{");
        var valueNames = e.ValueNames;
        for (int i = 0; i < e.Values.Length; i++)
        {
            var value = e.Values[i];
            var name = !valueNames.IsDefaultOrEmpty ? valueNames[i] : value.Name.ToString();

            w.WriteLine($"\t{name} = {value.Value},");
        }
        w.WriteLine("};");
        w.WriteLine();
    }

    protected (int PaddingBetweenTypeAndName, int PaddingBetweenNameAndComment) CalculatePaddingForMembers(ParStructure s)
    {
        int paddingBetweenTypeAndName = 32;
        int paddingBetweenNameAndComment = 32;

        var sb = new StringBuilder();
        for (int i = 0; i < s.Members.Length; i++)
        {
            var m = s.Members[i];

            sb.Clear();
            FormatMemberType(sb, m, out var typeLength);
            if (typeLength > (paddingBetweenTypeAndName - 4))
            {
                paddingBetweenTypeAndName = typeLength + 4;
            }

            var name = !s.MemberNames.IsDefaultOrEmpty ? s.MemberNames[i] : m.Name.ToString();
            if (name.Length > (paddingBetweenNameAndComment - 4))
            {
                paddingBetweenNameAndComment = name.Length + 4;
            }
        }

        return (paddingBetweenTypeAndName, paddingBetweenNameAndComment);
    }

    protected void FormatMemberType(StringBuilder sb, ParMember m, out int length)
    {
        var start = sb.Length;
        formatRecursive(sb, m);
        length = sb.Length - start;

        static void formatRecursive(StringBuilder sb, ParMember m)
        {
            sb.Append(TypeToString(m.Type));
            switch (m.Type)
            {
                case ParMemberType.STRUCT:
                    sb.Append(' ');
                    var structName = ((ParMemberStruct)m).StructName;
                    sb.Append(structName?.ToString() ?? "void");
                    break;
                case ParMemberType.ENUM:
                    sb.Append(' ');
                    sb.Append(((ParMemberEnum)m).EnumName.ToString());
                    break;
                case ParMemberType.BITSET:
                    sb.Append("<enum ");
                    sb.Append(((ParMemberEnum)m).EnumName.ToString());
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

    protected void FormatMemberComment(StringBuilder sb, ParMember m)
    {
        sb.Append(" // type:");
        sb.Append(m.Type);
        switch (m.Subtype)
        {
            case ParMemberSubtype.NONE: break;
            case ParMemberSubtype._0x2087BB00: sb.Append(".ATARRAY_32BIT"); break;
            case ParMemberSubtype._0xDF7EBE85: sb.Append(".ATGUIDHASH"); break;
            case ParMemberSubtype._64BIT: sb.Append(".64BIT"); break;
            case ParMemberSubtype._32BIT: sb.Append(".32BIT"); break;
            case ParMemberSubtype._16BIT: sb.Append(".16BIT"); break;
            case ParMemberSubtype._8BIT: sb.Append(".8BIT"); break;
            default: sb.Append($".{m.Subtype}"); break;
        }
    }

    private static string TypeToString(ParMemberType type)
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
