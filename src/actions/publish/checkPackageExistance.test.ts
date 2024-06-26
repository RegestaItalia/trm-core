import { PublishWorkflowContext } from '.'
import { DummyLogger, Logger } from '../../logger';
import { PUBLIC_RESERVED_KEYWORD, Registry } from '../../registry';
import { TrmPackage } from '../../trmPackage';
import { checkPackageExistance } from './checkPackageExistance';

beforeAll(() => {
    Logger.logger = new DummyLogger();
})

describe(`when checkPackageExistance step is invoked`, () => {
    describe(`with a valid package name and a package that doesn't exist yet`, () => {
        it(`should fill the context with the expected package informations`, async () => {
            // constant declaration
            const PACKAGE_NAME = 'test-package';

            // given
            let mockRegistry = new Registry(PUBLIC_RESERVED_KEYWORD);
            let dummyPackage = new TrmPackage(PACKAGE_NAME, mockRegistry);

            //mock required calls
            let mockedExists = jest.fn();
            mockedExists.mockResolvedValue(false);
            dummyPackage.exists = mockedExists;

            let context: PublishWorkflowContext = {
                rawInput: {
                    package: {
                        name: '',
                        version: ''
                    },
                    registry: null
                },
                parsedInput: {
                    packageName: PACKAGE_NAME
                },
                runtime: {
                    dummyPackage
                }
            };

            // when
            await checkPackageExistance.run(context);

            // then
            expect(context.runtime.packageExistsOnRegistry).toEqual(false);
        });
    });
});