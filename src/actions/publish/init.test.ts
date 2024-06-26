import { PublishWorkflowContext, WorkflowParsedInput, WorkflowRuntime } from '.'
import { DummyLogger, Logger } from '../../logger';
import { PUBLIC_RESERVED_KEYWORD, Registry } from '../../registry';
import { TrmPackage } from '../../trmPackage';
import { init } from './init'

beforeAll(() => {
    Logger.logger = new DummyLogger();
})

describe('when init step is invoked', () => {
    describe('with a valid package name and a valid version', () => {
        it('should fill the context with the expected package informations', async () => {
            // constant declaration
            const PACKAGE_NAME = 'test-package';
            const VERSION = '1.0.0';

            // given
            let mockRegistry = new Registry(PUBLIC_RESERVED_KEYWORD);

            let context: PublishWorkflowContext = {
                rawInput: {
                    package: {
                        name: PACKAGE_NAME,
                        version: VERSION
                    },
                    registry: mockRegistry
                },
                parsedInput: {},
                runtime: {}
            };

            let expectedParsedInput: WorkflowParsedInput = {
                packageName: PACKAGE_NAME,
                version: VERSION,
                releaseFolder: undefined,
                releaseTimeout: 180
            };

            let expectedRuntime: WorkflowRuntime = {
                registry: mockRegistry,
                dummyPackage: new TrmPackage(PACKAGE_NAME, mockRegistry),
                manifest: {
                    name: PACKAGE_NAME,
                    version: VERSION,
                    sapEntries: {},
                    dependencies: []
                }
            }

            // when
            await init.run(context);

            // then
            expect(context.parsedInput).toEqual(expectedParsedInput);
            expect(context.runtime).toEqual(expectedRuntime);
        });
    });
    describe('without a package version', () => {
        it('should throw an exception', () => {
            // given
            let mockRegistry = new Registry(PUBLIC_RESERVED_KEYWORD);

            let context: PublishWorkflowContext = {
                rawInput: {
                    package: {
                        name: 'test-package',
                        version: ''
                    },
                    registry: mockRegistry
                },
                parsedInput: {},
                runtime: {}
            };

            // when - then
            expect(init.run(context)).rejects.toEqual(new Error(`Package version empty.`));
        });
    });
});