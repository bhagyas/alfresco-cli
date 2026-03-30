import { AlfrescoApi, SitesApi } from '@alfresco/js-api';

describe('login api', () => {
  it('should return a token', async () => {
    const hostEcm = process.env.ALFRESCO_HOST;
    const username = process.env.ALFRESCO_USERNAME;
    const password = process.env.ALFRESCO_PASSWORD;

    if (!hostEcm || !username || !password) {
      throw new Error('Missing required environment variables: ALFRESCO_HOST, ALFRESCO_USERNAME, ALFRESCO_PASSWORD');
    }

    let a = new AlfrescoApi({
      hostEcm: hostEcm,
    })
    let r = await a.login(username, password);
    (await new SitesApi(a).listSites({})).list.entries.forEach(e => console.log(e.entry.title))
  })
})
