import { PermLevel } from "../helpers/permissions";
import { Client, PermissionFlags } from "discord.js";

module.exports = class Command {

    public client: Client;
    public name: string;
    public enabled: boolean;
    public aliases: string[];
    public clientPermissions: PermissionFlags[]
    public permLevel: PermLevel;

    constructor (client: Client, {
        name = null,
        enabled = true,
        aliases = new Array(),
        clientPermissions = new Array(),
        permLevel = "Owner"
    }: {
        name: string,
        enabled: boolean,
        aliases: string[],
        clientPermissions: PermissionFlags[],
        permLevel: PermLevel
    })
    {
        this.client = client;
        this.name = name;
        this.enabled = enabled;
        this.aliases = aliases;
        this.clientPermissions = clientPermissions;
        this.permLevel = permLevel;
    }
};