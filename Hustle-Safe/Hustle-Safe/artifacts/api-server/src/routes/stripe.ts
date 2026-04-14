import { Router } from "express";
import Stripe from "stripe";

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

router.post("/stripe/create-checkout-session", async (req, res) => {
  try {
    const { tier, price } = req.body;

    if (!tier || !price) {
      res.status(400).json({ error: "Missing tier or price" });
      return;
    }

    // Determine the origin from the request to redirect back correctly
    // In dev, the Vite server usually runs on port 5173 
    // but the Origin header sent by browser should tell us exactly.
    const origin = req.headers.origin || "http://localhost:5173";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "inr",
            product_data: {
              name: `HustleSafe ${tier} Policy`,
              description: `Weekly premium for ${tier} parametric coverage`,
            },
            unit_amount: Math.round(price * 100), // Stripe uses cents/paise
          },
          quantity: 1,
        },
      ],
      mode: "payment", // or 'subscription' if we want recurring, but 'payment' is simpler for one-off/mock
      success_url: `${origin}/worker/policy?success=true&tier=${tier}`,
      cancel_url: `${origin}/worker/policy?canceled=true`,
    });

    res.json({ url: session.url });
    return;
  } catch (err: any) {
    req.log.error({ err }, "Stripe checkout session creation failed");
    res.status(500).json({ error: err.message || "Failed to create checkout session" });
    return;
  }
});

export default router;
