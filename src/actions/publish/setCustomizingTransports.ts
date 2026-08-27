import { Step } from "@simonegaffurini/sammarksworkflow";
import { Inquirer, Logger } from "trm-commons";
import { PublishWorkflowContext } from ".";
import { Transport, TrmTransportIdentifier } from "../../transport";

type CustomizingTransport = {
    trkorr: string;
    description: string;
};

const ADD_OPTION = "add";
const DONE_OPTION = "done";

const normalizeTrkorr = (trkorr: string): string => trkorr.trim().toUpperCase();

const validateCustomizingTransport = async (transport: Transport): Promise<void> => {
    //TODO: actually, a workbench transport can be considered customizing if it only contains table content for tables without client
    //how to check this?
    if ((await transport.getE070()).trfunction !== "W") {
        throw new Error("Transport request must be of type customizing");
    }

    const aggregate = [transport, ...(await transport.getTasks())];
    const entries = await Promise.all(aggregate.map(item => item.getE071()));
    if (entries.every(item => item.length === 0)) {
        throw new Error("Transport request is empty");
    }
};

/**
 * Retain customizing transports from the latest release, validate transports
 * supplied by the user, and optionally let the user update the selection.
 */
export const setCustomizingTransports: Step<PublishWorkflowContext> = {
    name: "set-customizing-transports",
    filter: async (context): Promise<boolean> => {
        if (!context.rawInput.publishData.noCustomizingTransports) {
            return true;
        }

        Logger.log("Skipping customizing transports publish (user input)", true);
        return false;
    },
    run: async (context): Promise<void> => {
        const publishData = context.rawInput.publishData;
        const latestCustomizingTransports = (context.runtime.latest.data?.transports ?? []).filter(
            transport => transport.type === TrmTransportIdentifier.CUST
        );
        const latestByTrkorr = new Map(
            latestCustomizingTransports.map(transport => [normalizeTrkorr(transport.trkorr), transport])
        );

        Logger.loading(
            "Reading customizing transports...",
            (publishData.customizingTransports?.length ?? 0) > 0
        );

        const selectedTrkorrs = [
            ...latestCustomizingTransports.map(transport => transport.trkorr),
            ...(publishData.customizingTransports ?? [])
        ].map(normalizeTrkorr);

        publishData.customizingTransports = [...new Set(selectedTrkorrs)];

        let enrichedCustomizing: CustomizingTransport[] = [];
        for (const trkorr of publishData.customizingTransports) {
            const retainedTransport = latestByTrkorr.get(trkorr);
            if (retainedTransport) {
                enrichedCustomizing.push({ trkorr, description: retainedTransport.description });
                continue;
            }

            const transport = new Transport(trkorr);
            try {
                await validateCustomizingTransport(transport);
            } catch (error) {
                const reason = error instanceof Error
                    ? error.message.toLowerCase()
                    : "invalid transport request";
                throw new Error(`Unable to add transport ${trkorr}: ${reason}`);
            }

            enrichedCustomizing.push({
                trkorr,
                description: await transport.getDescription()
            });
        }

        if (!context.rawInput.contextData.noInquirer) {
            const shouldEdit = (await Inquirer.prompt({
                message: enrichedCustomizing.length > 0
                    ? "Do you want to add more customizing transports?"
                    : "Do you want to add customizing transports?",
                name: "continue",
                type: "confirm",
                default: enrichedCustomizing.length > 0
            })).continue;

            if (shouldEdit) {
                let option: CustomizingTransport | typeof ADD_OPTION | typeof DONE_OPTION;
                do {
                    option = (await Inquirer.prompt({
                        message: "Select option",
                        name: "option",
                        type: "list",
                        choices: [
                            ...enrichedCustomizing.map(transport => ({
                                name: `- ${Transport.getTransportIcon()}  ${transport.trkorr} ${transport.description}`.trim(),
                                value: transport
                            })),
                            { name: "+ Add", value: ADD_OPTION },
                            { name: "x Done", value: DONE_OPTION }
                        ],
                        default: ADD_OPTION
                    })).option;

                    if (option === ADD_OPTION) {
                        const trkorr = (await Inquirer.prompt({
                            message: "Input customizing transport request",
                            name: "trkorr",
                            type: "input",
                            validate: async (input: string) => {
                                const normalizedInput = normalizeTrkorr(input);

                                if (latestByTrkorr.has(normalizedInput)) {
                                    return true;
                                }

                                if (enrichedCustomizing.some(transport => transport.trkorr === normalizedInput)) {
                                    return "Already added";
                                }

                                Logger.loading(`Validating ${normalizedInput}...`);
                                try {
                                    await validateCustomizingTransport(new Transport(normalizedInput));
                                    return true;
                                } catch (error) {
                                    return error instanceof Error ? error.message : "Invalid transport request";
                                } finally {
                                    Logger.forceStop();
                                }
                            }
                        })).trkorr;

                        if (trkorr) {
                            const normalizedTrkorr = normalizeTrkorr(trkorr);
                            const retainedTransport = latestByTrkorr.get(normalizedTrkorr);
                            enrichedCustomizing.push({
                                trkorr: normalizedTrkorr,
                                description: retainedTransport?.description
                                    ?? await new Transport(normalizedTrkorr).getDescription()
                            });
                        }
                    } else if (typeof option === "object") {
                        const selectedTrkorr = option.trkorr;
                        enrichedCustomizing = enrichedCustomizing.filter(
                            transport => transport.trkorr !== selectedTrkorr
                        );
                    }
                } while (option !== DONE_OPTION);
            }

            for (const transport of enrichedCustomizing) {
                if (latestByTrkorr.has(transport.trkorr)) {
                    continue;
                }
                transport.description = (await Inquirer.prompt({
                    message: `Description of ${transport.trkorr}`,
                    type: "input",
                    name: "description",
                    default: transport.description,
                    validate: (input: string) => input.length <= 60 || "Description cannot exceed 60 characters"
                })).description || transport.description;
            }
        }

        for (const transport of enrichedCustomizing) {
            if (latestByTrkorr.has(transport.trkorr)) {
                context.runtime.customizing.retained.push(transport);
            } else {
                context.runtime.customizing.new.push(transport);
            }
        }
    }
};
