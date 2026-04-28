export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Notion-Version',
        }
      });
    }

    const url = new URL(request.url);
    const notionPath = url.pathname.replace('/proxy', '');
    const notionUrl = `https://api.notion.com/v1${notionPath}${url.search}`;

    const headers = new Headers();
    headers.set('Authorization', `Bearer ${env.NOTION_TOKEN}`);
    headers.set('Notion-Version', '2022-06-28');
    headers.set('Content-Type', 'application/json');

    const body = ['POST','PATCH','PUT'].includes(request.method) ? await request.text() : undefined;

    const res = await fetch(notionUrl, { method: request.method, headers, body });
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};
