import { createReview } from '../../lib/wc';

export const POST = async ({ request }) => {
    try {
        const body = await request.json();
        const { review } = body;

        // Basic validation
        if (!review || !review.commentOn || !review.rating || !review.author || !review.content) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields'
            }), { status: 400 });
        }

        const reviewPayload = {
            product_id: parseInt(review.commentOn),
            review: review.content,
            reviewer: review.author,
            reviewer_email: review.email || 'guest@yasui.store',
            rating: parseInt(review.rating),
            status: "hold" // Hold for moderation
        };

        const result = await createReview(reviewPayload);

        return new Response(JSON.stringify({
            success: true,
            data: result
        }), { status: 200 });

    } catch (error) {
        console.error('Submit Review Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500 });
    }
};
