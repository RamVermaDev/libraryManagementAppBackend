import crypto from 'crypto';
import { userModel } from '../models/userModel.mjs';
import { MONTHLY_PRICE, YEARLY_PRICE, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } from '../../config.mjs';
import sendEmail from '../utils/sendEmail.mjs';

/**
 * POST /api/subscription/create-order
 * Body: { plan: 'monthly' | 'yearly' }
 */
const createSubscriptionOrder = async (req, res) => {
    try {
        const { plan = 'monthly' } = req.body;
        const isYearly = plan === 'yearly';
        const price = isYearly ? YEARLY_PRICE : MONTHLY_PRICE;
        const amountInPaise = price * 100;

        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
            return res.status(500).json({
                success: false,
                message: 'Razorpay keys are not configured on the server.',
            });
        }

        // Direct HTTP call to Razorpay Orders API
        const authHeader = 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
        const response = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: amountInPaise,
                currency: 'INR',
                receipt: `rcpt_${req.user._id.toString().slice(-6)}_${Date.now().toString().slice(-6)}`,
                notes: {
                    userId: req.user._id.toString(),
                    plan: isYearly ? 'yearly' : 'monthly',
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Razorpay Order Creation Failed:', data);
            return res.status(400).json({
                success: false,
                message: data.error?.description || 'Failed to create Razorpay order.',
            });
        }

        return res.status(200).json({
            success: true,
            orderId: data.id,
            amount: amountInPaise,
            currency: 'INR',
            keyId: RAZORPAY_KEY_ID,
            plan: isYearly ? 'yearly' : 'monthly',
        });

    } catch (error) {
        console.error('Create Subscription Order Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Something went wrong while creating payment order.',
        });
    }
};

/**
 * POST /api/subscription/verify-payment
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan }
 */
const verifySubscriptionPayment = async (req, res) => {
    try {
        // plan is NOT read from req.body — client cannot be trusted for this
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing payment verification params.',
            });
        }

        // Verify Razorpay SHA256 HMAC Signature
        const hmac = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET);
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const generatedSignature = hmac.digest('hex');

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature. Verification failed.',
            });
        }

        // Fetch original order from Razorpay to get server-written notes.plan
        // Client cannot forge this — notes were written by our server during createOrder
        const authHeader = 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
        const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
            headers: { 'Authorization': authHeader },
        });
        const orderData = await orderRes.json();

        if (!orderRes.ok) {
            console.error('Razorpay Order Fetch Failed:', orderData);
            return res.status(400).json({
                success: false,
                message: 'Could not verify order details with Razorpay.',
            });
        }

        // Read plan from notes — guaranteed to be what our server originally set
        const plan = orderData.notes?.plan ?? 'monthly';

        const user = await userModel.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Idempotency check — if this exact payment was already applied, return success without modifying again
        if (user.subscription?.paymentId === razorpay_payment_id) {
            return res.status(200).json({
                success: true,
                message: 'Payment already applied.',
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    isEmailVerified: user.isEmailVerified,
                    libraries: user.libraries,
                    createdAt: user.createdAt,
                    subscription: {
                        plan: user.subscription.plan,
                        status: user.subscription.status,
                        startAt: user.subscription.startAt,
                        endAt: user.subscription.endAt,
                    },
                },
            });
        }

        const isYearly = plan === 'yearly';
        const addDays = isYearly ? 365 : 30;

        // Calculate new endAt date
        const currentEndAt = user.subscription?.endAt ? new Date(user.subscription.endAt) : null;
        const now = new Date();
        const baseDate = (currentEndAt && currentEndAt > now) ? currentEndAt : now;

        const newEndAt = new Date(baseDate);
        newEndAt.setDate(newEndAt.getDate() + addDays);

        user.subscription = {
            plan: isYearly ? 'yearly' : 'monthly',
            status: 'active',
            startAt: now,
            endAt: newEndAt,
            paymentId: razorpay_payment_id,
            paymentProvider: 'razorpay',
            amount: isYearly ? YEARLY_PRICE : MONTHLY_PRICE,
            currency: 'INR',
            autoRenew: false,
        };

        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Subscription updated successfully!',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isEmailVerified: user.isEmailVerified,
                libraries: user.libraries,
                createdAt: user.createdAt,
                subscription: {
                    plan: user.subscription.plan,
                    status: user.subscription.status,
                    startAt: user.subscription.startAt,
                    endAt: user.subscription.endAt,
                },
            },
        });

    } catch (error) {
        console.error('Verify Subscription Payment Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Something went wrong while verifying payment.',
        });
    }
};

/**
 * POST /api/subscription/webhook
 * Razorpay Webhook listener — handles payment.captured and order.paid events.
 * Server-to-server safety net for dropped connections on client devices.
 */
const handleRazorpayWebhook = async (req, res) => {
    try {
        const webhookSignature = req.headers['x-razorpay-signature'];

        if (RAZORPAY_WEBHOOK_SECRET) {
            if (!webhookSignature) {
                return res.status(400).json({ success: false, message: 'Missing Razorpay signature header.' });
            }

            // Verify Webhook HMAC SHA256 Signature using raw body Buffer if present
            const hmac = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET);
            const payload = req.rawBody ? req.rawBody : JSON.stringify(req.body);
            hmac.update(payload);
            const expectedSignature = hmac.digest('hex');

            if (expectedSignature !== webhookSignature) {
                console.error('Razorpay Webhook Signature Mismatch');
                return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
            }
        }

        const event = req.body.event;

        // Process payment.captured or order.paid
        if (event === 'payment.captured' || event === 'order.paid') {
            const paymentEntity = req.body.payload?.payment?.entity;
            const notes = paymentEntity?.notes || req.body.payload?.order?.entity?.notes || {};

            const userId = notes.userId;
            const plan = notes.plan || 'monthly';
            const paymentId = paymentEntity?.id;

            if (!userId) {
                console.log('Webhook: No userId in payment notes, ignoring.');
                return res.status(200).json({ success: true, message: 'Event ignored (no userId)' });
            }

            const user = await userModel.findById(userId);
            if (!user) {
                console.log(`Webhook: User ${userId} not found.`);
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            // Idempotency check — skip if payment already processed
            if (paymentId && user.subscription?.paymentId === paymentId) {
                return res.status(200).json({ success: true, message: 'Payment already processed' });
            }

            const isYearly = plan === 'yearly';
            const addDays = isYearly ? 365 : 30;

            const currentEndAt = user.subscription?.endAt ? new Date(user.subscription.endAt) : null;
            const now = new Date();
            const baseDate = (currentEndAt && currentEndAt > now) ? currentEndAt : now;

            const newEndAt = new Date(baseDate);
            newEndAt.setDate(newEndAt.getDate() + addDays);

            user.subscription = {
                plan: isYearly ? 'yearly' : 'monthly',
                status: 'active',
                startAt: now,
                endAt: newEndAt,
                paymentId: paymentId || user.subscription?.paymentId,
                paymentProvider: 'razorpay',
                amount: isYearly ? YEARLY_PRICE : MONTHLY_PRICE,
                currency: 'INR',
                autoRenew: false,
            };

            await user.save();
            console.log(`Webhook: Subscription activated for user ${userId} (${plan})`);
        }

        return res.status(200).json({ success: true, message: 'Webhook processed successfully' });

    } catch (error) {
        console.error('Razorpay Webhook Error:', error);
        return res.status(500).json({ success: false, message: 'Webhook processing error' });
    }
};

/**
 * POST /api/subscription/manual-payment-submit
 * Body: { plan: 'monthly' | 'yearly', amount: number, transactionId: string }
 */
const submitManualPayment = async (req, res) => {
    try {
        const { plan = 'monthly', amount, transactionId } = req.body;

        if (!transactionId || transactionId.trim().length < 4) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid transaction reference ID / UTR number.'
            });
        }

        const user = req.user;
        const formattedDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
            <h2 style="color: #0F172A; margin-bottom: 5px;">💳 New Manual Payment Notification</h2>
            <p style="color: #64748B; font-size: 14px; margin-top: 0;">A user has submitted manual UPI payment details for subscription verification.</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 15px 0;" />
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #64748B;">User Name:</td><td style="font-weight: bold; color: #0F172A;">${user.name}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748B;">User Email:</td><td style="font-weight: bold; color: #0F172A;">${user.email}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748B;">Plan Selected:</td><td style="font-weight: bold; color: #4F46E5;">${plan.toUpperCase()}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748B;">Amount Claimed:</td><td style="font-weight: bold; color: #166534;">₹${amount}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748B;">Transaction ID / UTR:</td><td style="font-weight: bold; color: #DC2626; font-size: 16px;">${transactionId.trim()}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748B;">Submitted At:</td><td style="color: #334155;">${formattedDate}</td></tr>
            </table>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 15px 0;" />
            <p style="font-size: 12px; color: #94A3B8;">Please verify the transaction in your PhonePe / GooglePay / Paytm UPI app and activate the user subscription.</p>
        </div>
        `;

        try {
            await sendEmail({
                to: 'ramverma1493@gmail.com',
                subject: `[Manual Payment Alert] ₹${amount} - ${user.name} (${transactionId.trim()})`,
                text: `New manual payment submitted by ${user.name} (${user.email}). UTR: ${transactionId}. Amount: ₹${amount}. Plan: ${plan}`,
                html: emailHtml,
            });
        } catch (emailErr) {
            console.error('Manual payment owner email alert failed:', emailErr);
        }

        return res.status(200).json({
            success: true,
            message: 'Payment notification submitted successfully! Our team will verify and activate your subscription within 1 hour.',
        });
    } catch (error) {
        console.error('Submit Manual Payment Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Something went wrong while submitting payment details.'
        });
    }
};

export { createSubscriptionOrder, verifySubscriptionPayment, handleRazorpayWebhook, submitManualPayment };
