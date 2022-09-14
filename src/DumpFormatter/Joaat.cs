using System.Runtime.Serialization;
using System.Text;

namespace DumpFormatter;

internal static class Joaat
{
    private static readonly Dictionary<uint, string> translations = new();

    public static uint Hash(Span<byte> text)
    {
        uint hash = 0;
        foreach (byte b in text)
        {
            hash += b;
            hash += hash << 10;
            hash ^= hash >> 6;
        }
        hash += hash << 3;
        hash ^= hash >> 11;
        hash += hash << 15;
        return hash;
    }

    public static uint Hash(string str) => Hash(Encoding.UTF8.GetBytes(str));

    public static string GetString(uint hash) => translations.TryGetValue(hash, out var str) ? str : $"_0x{hash:X08}";

    public static bool AddString(string str) => translations.TryAdd(Hash(str), str);

    public static void LoadDictionary(string path)
    {
        //var exceptions = new List<Exception>();
        foreach (string line in File.ReadAllLines(path))
        {
            //try
            //{
                var s = line.Trim();
                if (s.Length == 0) { continue; }

                var s1u = char.ToUpperInvariant(s[0]) + s[1..];
                var s1l = char.ToLowerInvariant(s[0]) + s[1..];
                var su = s.ToUpperInvariant();
                var sl = s.ToLowerInvariant();

                if (!AddString(s)) { ThrowDuplicateHash(s); }
                if (s != s1u && !AddString(s1u)) { ThrowDuplicateHash(s1u); }
                if (s != s1l && !AddString(s1l)) { ThrowDuplicateHash(s1l); }
                if (s != su && !AddString(su)) { ThrowDuplicateHash(su); }
                if (s != sl && !AddString(sl)) { ThrowDuplicateHash(sl); }
            //}
            //catch (DuplicateHashException ex)
            //{
            //    exceptions.Add(ex);
            //}
        }

        //if (exceptions.Count > 0) { throw new AggregateException(exceptions); }

        static void ThrowDuplicateHash(string newString)
        {
            var h = Hash(newString);
            //throw new DuplicateHashException("Duplicate hash found while loading dictionary.", h, translations[h], newString);
        }
    }



    [Serializable]
    public class DuplicateHashException : Exception
    {
        public uint Hash { get; set; }
        public string ExistingString { get; set; } = string.Empty;
        public string NewString { get; set; } = string.Empty;

        public DuplicateHashException(string message, uint hash, string existingString, string newString)
            : base(message)
            => (Hash, ExistingString, NewString) = (hash, existingString, newString);

        public DuplicateHashException() { }
        public DuplicateHashException(string message) : base(message) { }
        public DuplicateHashException(string message, Exception inner) : base(message, inner) { }
        protected DuplicateHashException(SerializationInfo info, StreamingContext context) : base(info, context) { }
    }
}
