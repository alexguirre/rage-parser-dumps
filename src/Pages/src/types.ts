/**
 * Represents the supported games.
 */
export type GameId = "gta4" | "gta5" | "gta6" | "rdr2" | "rdr3" | "mp3" | "mc4" | "pong";

/**
 * Model for the registry.json file.
 */
export type Registry = {
    [game in GameId]: RegistryEntry[];
};

/**
 * Represents a build of a game in the registry.json file.
 */
export type RegistryEntry = {
    build: string;
    aliases: string[];
};
