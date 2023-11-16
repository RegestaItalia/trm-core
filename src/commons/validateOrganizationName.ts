export function validateOrganizationName(organization: string): string{
    organization = organization.toLowerCase();
    if(!organization.match(/^[a-z]*$/)){
        throw new Error('Invalid organization.');
    }
    return organization;
}