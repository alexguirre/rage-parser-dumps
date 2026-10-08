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

    public static string? TryGetString(uint hash) => translations.TryGetValue(hash, out var str) ? str : null;

    public static string GetString(uint hash) => translations.TryGetValue(hash, out var str) ? str : $"_0x{hash:X08}";

    public static bool AddString(string str) => translations.TryAdd(Hash(str), str);

    public static void LoadDictionary(string path)
    {
        //var exceptions = new List<Exception>();
        foreach (string line in File.ReadAllLines(path))
        {
            //try
            //{
                // Not trimmed, some names have leading/trailing whitespace (e.g. "CPED_CONFIG_FLAG_DisableHornAudioWhenDead ")
                if (string.IsNullOrWhiteSpace(line)) { continue; }

                if (!AddString(line)) { ThrowDuplicateHash(line); }
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
    }
}
