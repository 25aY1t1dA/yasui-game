export async function GET({ request }) {
    const url = new URL(request.url);
    const src = url.searchParams.get('src');

    // AMBIL DARI .ENV
    const LOCAL_USER = import.meta.env.WP_USER;
    const LOCAL_PASS = import.meta.env.WP_PASS;

    if (!src) return new Response('Missing src', { status: 400 });

    try {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        // BUAT KUNCI OTORISASI
        const authHeader = 'Basic ' + Buffer.from(`${LOCAL_USER}:${LOCAL_PASS}`).toString('base64');

        // AMBIL GAMBAR DENGAN KUNCI
        const response = await fetch(src, {
            headers: {
                'Authorization': authHeader
            }
        });

        // Cek jika gambar gagal diambil (misal 404 atau 401)
        if (!response.ok) {
            console.error(`Gagal ambil gambar: ${src} - Status: ${response.status}`);
            return new Response('Image fetch failed', { status: response.status });
        }

        // Teruskan gambar ke browser
        return new Response(response.body, {
            status: response.status,
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
                'Cache-Control': 'public, max-age=31536000, immutable'
            }
        });
    } catch (e) {
        console.error(e);
        return new Response('Error fetching image', { status: 500 });
    }
}