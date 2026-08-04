'use strict';

require('dotenv').config();

const RECIPIENT_PHONE = '966568991978';

async function sendAppointmentConfirmation() {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.PHONE_NUMBER_ID;

    if (!token) {
        throw new Error(
            'Missing WHATSAPP_TOKEN in .env.'
        );
    }

    if (!phoneNumberId) {
        throw new Error(
            'Missing PHONE_NUMBER_ID in .env.'
        );
    }

    const endpoint =
        `https://graph.facebook.com/v23.0/` +
        `${phoneNumberId}/messages`;

    const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: RECIPIENT_PHONE,
        type: 'template',

        template: {
            name: 'appointment_confirmation',

            language: {
                code: 'ar'
            },

            components: [
                {
                    type: 'body',

                    parameters: [
                        {
                            type: 'text',
                            text: 'أحمد محمد'
                        },
                        {
                            type: 'text',
                            text: 'د. نوف الراجحي'
                        },
                        {
                            type: 'text',
                            text: 'فرع جدة - الروضة'
                        },
                        {
                            type: 'text',
                            text: '10/08/2026'
                        },
                        {
                            type: 'text',
                            text: '06:00 مساءً'
                        }
                    ]
                }
            ]
        }
    };

    const controller = new AbortController();

    const timeoutId = setTimeout(
        () => controller.abort(),
        15000
    );

    try {
        console.log(
            'Sending appointment confirmation...'
        );

        const response = await fetch(
            endpoint,
            {
                method: 'POST',

                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify(payload),
                signal: controller.signal
            }
        );

        const responseText =
            await response.text();

        let responseBody;

        try {
            responseBody = responseText
                ? JSON.parse(responseText)
                : null;
        } catch {
            responseBody = {
                raw: responseText
            };
        }

        if (!response.ok) {
            console.error(
                'Meta request failed.'
            );

            console.error(
                JSON.stringify(
                    responseBody,
                    null,
                    2
                )
            );

            process.exitCode = 1;

            return;
        }

        const messageId =
            responseBody?.messages?.[0]?.id ||
            null;

        console.log(
            'Message accepted by Meta.'
        );

        console.log(
            'Status:',
            response.status
        );

        console.log(
            'Message ID:',
            messageId
        );

        console.log(
            JSON.stringify(
                responseBody,
                null,
                2
            )
        );

    } catch (error) {
        if (error?.name === 'AbortError') {
            console.error(
                'Meta request timed out after 15 seconds.'
            );
        } else {
            console.error(
                'WhatsApp request failed:',
                error?.message || error
            );
        }

        process.exitCode = 1;

    } finally {
        clearTimeout(timeoutId);
    }
}

sendAppointmentConfirmation();