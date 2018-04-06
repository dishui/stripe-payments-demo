/**
 * payments.js
 * Stripe Payments Demo. Created by Romain Huet (@romainhuet).
 *
 * This modern JavaScript file handles the checkout process using Stripe.
 *
 * 1. It shows how to accept card payments with the `card` Element, and
 * the `paymentRequestButton` Element for Payment Request and Apple Pay.
 * 2. It shows how to use the Stripe Sources API to accept non-card payments,
 * such as iDEAL, SOFORT, SEPA Direct Debit, and more.
 */

(async () => {
  'use strict';

  // Retrieve the configuration for the store.
  const config = await store.getConfig();

  // Create references to the main form and its submit button.
  //const form = document.getElementById('payment-form');
  //const submitButton = form.querySelector('button[type=submit]');

  /**
   * Setup Stripe Elements.
   */

  // Create a Stripe client.
  const stripe = Stripe(config.stripePublishableKey);
  /*stripe.applePayDomains.create({
    domain_name: '8377814e.ngrok.io'
  });*/

  // Create an instance of Elements.
  const elements = stripe.elements();

  // Prepare the options for Elements to be styled accordingly.
  const elementsOptions = {
    style: {
      base: {
        iconColor: '#666ee8',
        color: '#31325f',
        fontWeight: 400,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
        fontSmoothing: 'antialiased',
        fontSize: '15px',
        '::placeholder': {
          color: '#aab7c4',
        },
        ':-webkit-autofill': {
          color: '#666ee8',
        },
      },
    },
  };

  /**
   * Implement a Stripe Payment Request Button Element.
   *
   * This automatically supports the Payment Request API (already live on Chrome),
   * as well as Apple Pay on the Web on Safari.
   * When of these two options is available, this element adds a “Pay” button on top
   * of the page to let users pay in just a click (or a tap on mobile).
   */

  // Make sure all data is loaded from the store to compute the order amount.
  await store.loadProducts();

  // Create the payment request.
  const paymentRequest = stripe.paymentRequest({
    country: config.stripeCountry,
    currency: config.currency,
    total: {
      label: 'Total',
      amount: store.getOrderTotal(),
    },
    requestPayerName: true,
    requestPayerPhone: true,
    requestShipping: true,
    requestPayerEmail: true
  });

   // Callback when a token is created.
  paymentRequest.on('token', function(event) {
    console.log('creating token ', event);

    try {
      event.complete('success');
    } catch (error) {
      event.complete('fail');
    }
  });
  

  // Callback when the shipping address is updated.
  paymentRequest.on('shippingaddresschange', function(event) {
    console.log("shipping address changed", event);
    
  fetch('/shippingRates', {
    data: JSON.stringify({
      shippingAddress: event.shippingAdress
    }),
    method: 'PUT'
  }).then(function(response) {
    return response.json();
  }).then(function(result) {
    event.updateWith({
      status: 'success',
      shippingOptions: result
     });
  });

  
    console.log('paymentRequest', paymentRequest);
  });

  paymentRequest.on('shippingoptionchange', function(event) {
    // can update the shipping charge and tax
    console.log('shipping option changed', event);
    let cal = event.shippingOption.amount + store.getOrderTotal();
    let tax = 780
    let tot = cal + tax;
    event.updateWith(
      {
        status: 'success',
         displayItems: [
           {
             label: 'order',
             amount: store.getOrderTotal()
           },
           {
             label: 'shipping',
             amount: event.shippingOption.amount
           },
           {
           label: 'tax',
           amount: tax
         }
       ],
       total: {
         label: 'Total',
         amount: store.getOrderTotal() + tax + event.shippingOption.amount,
       },
      // shippingOption: event.shippingOption
      }
    );
    console.log('paymentRequest after shippingoptionchange', paymentRequest);
   });


  // Create the Payment Request Button.
  const paymentRequestButton = elements.create('paymentRequestButton', {
    paymentRequest,
  });

 
  // Check if the Payment Request is available (or Apple Pay on the Web).
  //we do not support asyn at the moment, so use straight promise
  console.log('can make payment ', paymentRequest.canMakePayment());
  paymentRequest.canMakePayment().then(function(result) {
    if(result) {
      console.log("is apple pay supported", result.applePay);
      paymentRequestButton.mount('#payment-request-button');
      // Show the payment request section.
      document.getElementById('payment-request').classList.add('visible');
    }
  })

  /**
   * Monitor the status of a source after a redirect flow.
   *
   * This means there is a `source` parameter in the URL, and an active order.
   * When this happens, we'll monitor the status of the order and present real-time
   * information to the user.
   */

  const pollOrderStatus = async (
    orderId,
    timeout = 30000,
    interval = 500,
    start = null
  ) => {
    start = start ? start : Date.now();
    const endStates = ['paid', 'failed'];
    // Retrieve the latest order status.
    const order = await store.getOrderStatus(orderId);
    await handleOrder(order, {status: null});
    if (
      !endStates.includes(order.metadata.status) &&
      Date.now() < start + timeout
    ) {
      // Not done yet. Let's wait and check again.
      setTimeout(pollOrderStatus, interval, orderId, timeout, interval, start);
    } else {
      if (!endStates.includes(order.metadata.status)) {
        // Status has not changed yet. Let's time out.
        console.warn(new Error('Polling timed out.'));
      }
    }
  };

  const orderId = store.getActiveOrderId();
  const mainElement = document.getElementById('main');
  if (orderId && window.location.search.includes('source')) {
    // Update the interface to display the processing screen.
    mainElement.classList.add('success', 'processing');

    // Poll the backend and check for an order status.
    // The backend updates the status upon receiving webhooks,
    // specifically the `source.chargeable` and `charge.succeeded` events.
    pollOrderStatus(orderId);
  } else {
    // Update the interface to display the checkout form.
    mainElement.classList.add('checkout');
  }

  
})();
