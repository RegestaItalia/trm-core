import { PublishWorkflowContext, WorkflowParsedInput, WorkflowRuntime } from '.'
import { CliInquirer } from '../../inquirer';
import { Inquirer } from '../../inquirer/Inquirer';
import { CliLogger, DummyLogger, Logger } from '../../logger';
import { Registry } from '../../registry';
import { TrmPackage } from '../../trmPackage';
import { init } from './init'
import createMockInstance from "jest-create-mock-instance";
import * as parsePackageName from '../../commons/parsePackageName';

beforeAll(() => {
    Logger.logger = createMockInstance(CliLogger);
    Inquirer.inquirer = createMockInstance(CliInquirer);
});

describe('when init step is invoked', () => {
    describe(`with a valid package name`, () => {
        const PACKAGE_NAME = 'valid-package';
        const mockRegistry = createMockInstance(Registry);
        beforeAll(() => {
            jest.spyOn(parsePackageName, 'parsePackageName').mockImplementation(() => {
                return {
                    fullName: PACKAGE_NAME,
                    name: PACKAGE_NAME
                };
            });
        });

        var context: PublishWorkflowContext = {
            rawInput: {
                package: {
                    name: PACKAGE_NAME,
                    version: ''
                },
                registry: mockRegistry
            },
            parsedInput: {},
            runtime: {}
        };

        describe(`never published before`, () => {
            beforeAll(() => {
                mockRegistry.packageExists.mockImplementation(async (name: string, version?: string) => {
                    return !(name === PACKAGE_NAME);
                });
            });

            describe(`with a valid semantic version`, () => {
                const PACKAGE_VERSION = '1.0.0';

                it(`should validate the input data`, async () => {
                    context.rawInput.package.version = PACKAGE_VERSION;

                    let expectedParsedInput: WorkflowParsedInput = {
                        packageName: PACKAGE_NAME,
                        version: PACKAGE_VERSION,
                        releaseFolder: undefined,
                        releaseTimeout: 180
                    };

                    let expectedRuntime: WorkflowRuntime = {
                        registry: mockRegistry,
                        dummyPackage: new TrmPackage(PACKAGE_NAME, mockRegistry),
                        manifest: {
                            name: PACKAGE_NAME,
                            version: PACKAGE_VERSION,
                            sapEntries: {},
                            dependencies: []
                        }
                    }

                    await init.run(context);

                    expect(context.parsedInput).toEqual(expectedParsedInput);
                    expect(context.runtime).toEqual(expectedRuntime);
                });
            });

            describe(`with an invalid version`, () => {
                it(`should throw an exception`, async () => {
                    context.rawInput.package.version = '';
                    expect(init.run(context)).rejects.toEqual(new Error(`Package version empty.`));
                });
            });

            describe(`with an invalid semantic version`, () => {
                it(`should wait for user input`, async () => {
                    context.rawInput.package.version = '1.0.0_INVALID';
                    //TODO
                });
            });
        });
        describe(`already published`, () => {
            const ALREADY_PUBLISHED = ['1.0.0'];

            beforeAll(() => {
                mockRegistry.packageExists.mockImplementation(async (name: string, version?: string) => {
                    if (name === PACKAGE_NAME) {
                        if (version === 'latest' || !version) {
                            return true;
                        } else {
                            if (ALREADY_PUBLISHED.includes(version)) {
                                return true;
                            } else {
                                return false;
                            }
                        }
                    } else {
                        return false;
                    }
                });
            });

            describe(`with a valid semantic version`, () => {
                describe(`and a release versioned like that already exists`, () => {
                    const PACKAGE_VERSION = '1.0.0';
                    it(`should throw an exception`, async () => {
                        context.rawInput.package.version = PACKAGE_VERSION;
                        //TODO
                    });
                });

                describe(`and a release versioned like that doesn't exist`, () => {
                    const PACKAGE_VERSION = '1.1.0';
                    it(`should validate the input data`, async () => {
                        context.rawInput.package.version = PACKAGE_VERSION;
                        //TODO
                    });
                });
            });

            describe(`with 'latest' version`, () => {
                it(`should propose the next patch version`, async () => { 
                    //TODO
                });
            });
        });

    });
});