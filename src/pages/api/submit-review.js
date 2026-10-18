import { createReview } from '../../lib/wc';
import { sanitizeText, stripHtml, isValidEmail } from '../../lib/sanitize';

export const POST = async ({ request }) => {
    try {
        const body = await request.json();
        const { review } = body || {};

        if (!review) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Data ulasan tidak valid.'
            }), { status: 400 });
        }

        const productId = parseInt(review.commentOn, 10);
        const rating = parseInt(review.rating, 10);
        const author = sanitizeText(review.author || "", 60);
        const content = stripHtml(review.content || "").slice(0, 1000);
        const email = (review.email || "").trim().toLowerCase();

        if (!productId || isNaN(productId) || productId <= 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'ID produk tidak valid.'
            }), { status: 400 });
        }

        if (!rating || isNaN(rating) || rating < 1 || rating > 5) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Rating harus berada di antara 1 dan 5 bintang.'
            }), { status: 400 });
        }

        if (!author || author.length < 2) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Nama reviewer minimal 2 karakter.'
            }), { status: 400 });
        }

        if (!content || content.length < 5) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Isi testimoni minimal 5 karakter.'
            }), { status: 400 });
        }

        const reviewerEmail = (email && isValidEmail(email)) ? email : 'guest@yasuigame.com';

        const reviewPayload = {
            product_id: productId,
            review: content,
            reviewer: author,
            reviewer_email: reviewerEmail,
            rating: rating,
            status: "hold" // Hold for admin moderation
        };

        const result = await createReview(reviewPayload);

        return new Response(JSON.stringify({
            success: true,
            message: 'Ulasan berhasil dikirim dan menunggu moderasi admin.',
            data: {
                id: result.id,
                rating: result.rating,
                product_id: result.product_id
            }
        }), { status: 200 });

    } catch (error) {
        console.error('Submit Review Error:', error.message);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Gagal mengirim ulasan.'
        }), { status: 500 });
    }
};
