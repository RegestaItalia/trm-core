import createMockInstance from 'jest-create-mock-instance';
import { PublishWorkflowContext } from '.'
import { DummyLogger, Logger } from '../../logger';
import { Registry } from '../../registry';
import { TrmPackage } from '../../trmPackage';
import { checkPackageExistance } from './checkPackageExistance';

beforeAll(() => {
    Logger.logger = createMockInstance(DummyLogger);
});

describe(`when checkPackageExistance step is invoked`, () => {
    describe(`with a valid package name and a package that doesn't exist yet`, () => {
        it(`should fill the context with the expected package informations`, async () => {
            // constant declaration
            const PACKAGE_NAME = 'test-package';

            // given
            let mockRegistry = new Registry('public');
            let mockPackage = new TrmPackage(PACKAGE_NAME, mockRegistry);

            let context: PublishWorkflowContext = {
                rawInput: {
                    package: {
                        name: '',
                        version: ''
                    },
                    registry: createMockInstance(Registry)
                },
                parsedInput: {
                    packageName: PACKAGE_NAME
                },
                runtime: {
                    dummyPackage: mockPackage
                }
            };

            //mock required calls
            let mockedExists = jest.fn();
            mockedExists.mockResolvedValue(false);
            mockPackage.exists = mockedExists;

            // when
            await checkPackageExistance.run(context);

            // then
            expect(context.runtime.packageExistsOnRegistry).toEqual(false);
        });
    });
});