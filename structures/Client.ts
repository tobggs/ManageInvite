import { Client, ClientOptions, Collection, Message, Snowflake } from "discord.js";
import util from "util";
import path from "path";

import DatabaseHandler from "../helpers/database";
import type Command from "./Command";
import Logger from "../helpers/logger";
import PermLevels from "../helpers/permissions";

interface DashboardStates {
    [path: string]: string;
}
interface KnownGuild {
    id: Snowflake;
    user: Snowflake;
}
interface StatsCache {
    guildsCreated: number;
    guildsDeleted: number;
    commandsRan: number;
    pgQueries: number;
}

class ManageInvite extends Client {

    public commands: Collection<string, Command>;
    public aliases: Collection<string, Command>;
    
    public database: DatabaseHandler;
    public logger: Logger;
    
    public states: DashboardStates;
    public knownGuilds: KnownGuild[];
    public waitingForVerification: Snowflake[];

    public statsCache: StatsCache;

    constructor (options: ClientOptions) {
        super(options);
        // Commands
        this.commands = new Collection(); // Creates new commands collection
        this.aliases = new Collection(); // Creates new command aliases collection
        // Utils
        this.logger = new Logger()
        // Database
        this.database = new DatabaseHandler(this);
        // Dashboard
        this.states = {};
        this.knownGuilds = [];
        this.waitingForVerification = [];
        // Cache
        this.statsCache = {
            guildsCreated: 0,
            guildsDeleted: 0,
            commandsRan: 0,
            pgQueries: 0
        }
    }

    loadCommand (commandPath: string, commandName: string) {
        try {
            const props = new (require(`.${commandPath}${path.sep}${commandName}`))(this);
            props.conf.location = commandPath;
            if (props.init){
                props.init(this);
            }
            this.commands.set(props.help.name, props);
            props.conf.aliases.forEach((alias: string) => {
                this.aliases.set(alias, props.help.name);
            });
            return false;
        } catch (e) {
            return `Unable to load command ${commandName}: ${e}`;
        }
    }

    async unloadCommand (commandPath: string, commandName: string) {
        let command;
        if (this.commands.has(commandName)) {
            command = this.commands.get(commandName);
        } else if (this.aliases.has(commandName)){
            command = this.commands.get(this.aliases.get(commandName));
        }
        if (!command){
            return `The command \`${commandName}\` doesn't seem to exist, nor is it an alias. Try again!`;
        }
        if (command.shutdown){
            await command.shutdown(this);
        }
        delete require.cache[require.resolve(`.${commandPath}${path.sep}${commandName}.js`)];
        return false;
    }

    getLevel (message: Message) {
        let permlvl = 0;
        const permOrder = PermLevels.slice(0).sort((p, c) => p.level < c.level ? 1 : -1);
        while (permOrder.length) {
            const currentLevel = permOrder.shift();
            if (currentLevel.check(message)) {
                permlvl = currentLevel.level;
                break;
            }
        }
        return permlvl;
    }
}

module.exports = ManageInvite;
