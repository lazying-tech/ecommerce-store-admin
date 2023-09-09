import prismadb from "@/lib/prismadb";

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: { storeId: string };
  }
) {
  const { productsfromCart } = await req.json();

  if (!productsfromCart || productsfromCart.length === 0) {
    return new NextResponse("Products are required", { status: 400 });
  }
  const productIds = productsfromCart.map((item: any) => item.id);

  const products = await prismadb.product.findMany({
    where: {
      id: {
        in: productIds,
      },
    },
  });
  const productsWithQuantity = products.map((product, index) => {
    if (product.id === productsfromCart[index].id) {
      return { ...product, quantity: productsfromCart[index].quantity };
    }
  });

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  productsWithQuantity.forEach((product: any) => {
    line_items.push({
      quantity: product.quantity,
      price_data: {
        currency: "USD",
        product_data: { name: product.name },
        unit_amount: product.price.toNumber() * 100,
      },
    });
  });

  const order = await prismadb.order.create({
    data: {
      storeId: params.storeId,
      isPaid: false,
      orderItems: {
        create: productsWithQuantity.map((item: any) => ({
          product: { connect: { id: item.id } },
          quantity: item.quantity,
        })),
      },
    },
  });

  const session = await stripe.checkout.sessions.create({
    line_items,
    mode: "payment",
    billing_address_collection: "required",
    phone_number_collection: {
      enabled: true,
    },
    success_url: `${process.env.FRONTEND_STORE_URL}/cart?success=1`,
    cancel_url: `${process.env.FRONTEND_STORE_URL}/cart?canceled=1`,
    metadata: {
      orderId: order.id,
    },
  });

  return NextResponse.json(
    { url: session.url },
    {
      headers: corsHeaders,
    }
  );
}
