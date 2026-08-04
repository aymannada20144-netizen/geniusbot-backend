'use strict';

/**
 * ============================================================================
 * GeniusBot Communication Platform
 * WhatsAppTransport
 * ----------------------------------------------------------------------------
 * Sends standard communication messages through Meta WhatsApp Cloud API.
 *
 * Responsibilities:
 * - Validate WhatsApp transport requirements.
 * - Convert the standard message into Meta template payload format.
 * - Convert template variables into ordered Meta body parameters.
 * - Send the request to Meta Cloud API.
 * - Return a standard transport result.
 * - Classify failures as retryable or non-retryable.
 *
 * This transport does NOT:
 * - Build business messages.
 * - Choose message templates.
 * - Retry failed requests.
 * - Access the database.
 * - Manage queues.
 * - Persist delivery records.
 * ============================================================================
 */

const env = require('../../config/env');

class WhatsAppTransport {

    /**
     * @param {Object} [options]
     * @param {string} [options.token]
     * @param {string} [options.phoneNumberId]
     * @param {string} [options.apiVersion='v23.0']
     * @param {number} [options.timeoutMs=15000]
     * @param {Function} [options.fetchImpl]
     */
    constructor({
        token = env.whatsapp.token,
        phoneNumberId = env.whatsapp.phoneNumberId,
        apiVersion = 'v23.0',
        timeoutMs = 15000,
        fetchImpl = global.fetch
    } = {}) {

        if (
            typeof token !== 'string' ||
            token.trim() === ''
        ) {
            throw new TypeError(
                'WhatsAppTransport token is required.'
            );
        }

        if (
            typeof phoneNumberId !== 'string' ||
            phoneNumberId.trim() === ''
        ) {
            throw new TypeError(
                'WhatsAppTransport phoneNumberId is required.'
            );
        }

        if (
            typeof apiVersion !== 'string' ||
            apiVersion.trim() === ''
        ) {
            throw new TypeError(
                'WhatsAppTransport apiVersion is required.'
            );
        }

        if (
            typeof timeoutMs !== 'number' ||
            !Number.isFinite(timeoutMs) ||
            timeoutMs <= 0
        ) {
            throw new TypeError(
                'WhatsAppTransport timeoutMs must be a positive number.'
            );
        }

        if (typeof fetchImpl !== 'function') {
            throw new TypeError(
                'WhatsAppTransport requires a fetch implementation.'
            );
        }

        this.token = token.trim();
        this.phoneNumberId = phoneNumberId.trim();
        this.apiVersion = apiVersion.trim();
        this.timeoutMs = timeoutMs;
        this.fetch = fetchImpl;
    }

    /**
     * Sends a standard communication message through WhatsApp.
     *
     * @param {Object} message
     * @returns {Promise<Readonly<Object>>}
     */
    async send(message) {

        this.#validateMessage(message);

        const payload = this.#buildPayload(message);

        const controller = new AbortController();

        const timeoutId = setTimeout(
            () => controller.abort(),
            this.timeoutMs
        );

        try {

            const response = await this.fetch(
                this.#buildEndpoint(),
                {
                    method: 'POST',

                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },

                    body: JSON.stringify(payload),

                    signal: controller.signal
                }
            );

            const responseBody =
                await this.#readResponseBody(response);

            if (!response.ok) {
                throw this.#createMetaError(
                    response.status,
                    responseBody
                );
            }

            const messageId =
                responseBody?.messages?.[0]?.id || null;

            return Object.freeze({
                provider: 'meta',
                channel: 'whatsapp',
                statusCode: response.status,
                messageId,
                recipient: message.recipient.phone,
                response: responseBody
            });

        } catch (error) {

            if (error?.name === 'AbortError') {
                throw this.#createTransportError({
                    name: 'WhatsAppTransportTimeoutError',
                    code: 'WHATSAPP_REQUEST_TIMEOUT',
                    message:
                        `WhatsApp request exceeded ${this.timeoutMs}ms.`,
                    retryable: true,
                    cause: error
                });
            }

            if (this.#isTransportError(error)) {
                throw error;
            }

            throw this.#createTransportError({
                name: 'WhatsAppTransportNetworkError',
                code: 'WHATSAPP_NETWORK_ERROR',
                message:
                    error?.message ||
                    'WhatsApp network request failed.',
                retryable: true,
                cause: error
            });

        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Validates the standard message required by this transport.
     *
     * @param {Object} message
     * @private
     */
    #validateMessage(message) {

        if (
            !message ||
            typeof message !== 'object' ||
            Array.isArray(message)
        ) {
            throw new TypeError(
                'WhatsAppTransport message must be an object.'
            );
        }

        if (
            typeof message.channel !== 'string' ||
            message.channel.trim().toLowerCase() !== 'whatsapp'
        ) {
            throw new TypeError(
                'WhatsAppTransport only supports the whatsapp channel.'
            );
        }

        if (
            !message.recipient ||
            typeof message.recipient !== 'object' ||
            Array.isArray(message.recipient) ||
            typeof message.recipient.phone !== 'string' ||
            message.recipient.phone.trim() === ''
        ) {
            throw new TypeError(
                'WhatsAppTransport message.recipient.phone is required.'
            );
        }

        if (
            !message.template ||
            typeof message.template !== 'object' ||
            Array.isArray(message.template)
        ) {
            throw new TypeError(
                'WhatsAppTransport message.template is required.'
            );
        }

        if (
            typeof message.template.name !== 'string' ||
            message.template.name.trim() === ''
        ) {
            throw new TypeError(
                'WhatsAppTransport message.template.name is required.'
            );
        }

        if (
            typeof message.template.language !== 'string' ||
            message.template.language.trim() === ''
        ) {
            throw new TypeError(
                'WhatsAppTransport message.template.language is required.'
            );
        }

        if (
            message.template.components !== undefined &&
            !Array.isArray(message.template.components)
        ) {
            throw new TypeError(
                'WhatsAppTransport message.template.components must be an array.'
            );
        }

        if (
            message.template.variables !== undefined &&
            (
                !message.template.variables ||
                typeof message.template.variables !== 'object' ||
                Array.isArray(message.template.variables)
            )
        ) {
            throw new TypeError(
                'WhatsAppTransport message.template.variables must be an object.'
            );
        }

        const hasComponents =
            Array.isArray(message.template.components) &&
            message.template.components.length > 0;

        const hasVariables =
            message.template.variables &&
            Object.keys(message.template.variables).length > 0;

        if (!hasComponents && !hasVariables) {
            return;
        }

        if (hasComponents) {
            this.#validateComponents(
                message.template.components
            );

            return;
        }

        this.#validateVariables(
            message.template.variables
        );
    }

    /**
     * Validates template variables.
     *
     * Variable insertion order is significant because Meta template
     * parameters are positional: {{1}}, {{2}}, {{3}}, etc.
     *
     * @param {Object} variables
     * @private
     */
    #validateVariables(variables) {

        for (const [name, value] of Object.entries(variables)) {

            if (
                value === undefined ||
                value === null
            ) {
                throw new TypeError(
                    `WhatsAppTransport template variable "${name}" is required.`
                );
            }

            if (
                typeof value === 'string' &&
                value.trim() === ''
            ) {
                throw new TypeError(
                    `WhatsAppTransport template variable "${name}" cannot be empty.`
                );
            }

            if (
                ![
                    'string',
                    'number',
                    'boolean'
                ].includes(typeof value)
            ) {
                throw new TypeError(
                    `WhatsAppTransport template variable "${name}" must be a string, number, or boolean.`
                );
            }
        }
    }

    /**
     * Validates prebuilt Meta components.
     *
     * @param {Array<Object>} components
     * @private
     */
    #validateComponents(components) {

        for (const component of components) {

            if (
                !component ||
                typeof component !== 'object' ||
                Array.isArray(component)
            ) {
                throw new TypeError(
                    'WhatsAppTransport template component must be an object.'
                );
            }

            if (
                typeof component.type !== 'string' ||
                component.type.trim() === ''
            ) {
                throw new TypeError(
                    'WhatsAppTransport template component.type is required.'
                );
            }

            if (
                component.parameters !== undefined &&
                !Array.isArray(component.parameters)
            ) {
                throw new TypeError(
                    'WhatsAppTransport template component.parameters must be an array.'
                );
            }
        }
    }

    /**
     * Converts the standard communication message into Meta payload format.
     *
     * Prebuilt components take precedence over variables.
     *
     * @param {Object} message
     * @returns {Object}
     * @private
     */
    #buildPayload(message) {

        const template = {
            name: message.template.name.trim(),

            language: {
                code: message.template.language.trim()
            }
        };

        const components =
            this.#resolveTemplateComponents(
                message.template
            );

        if (components.length > 0) {
            template.components = components;
        }

        return {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: message.recipient.phone.trim(),
            type: 'template',
            template
        };
    }

    /**
     * Resolves Meta template components.
     *
     * If explicit components are supplied, they are sent unchanged.
     * Otherwise template variables are converted to ordered body parameters.
     *
     * @param {Object} template
     * @returns {Array<Object>}
     * @private
     */
    #resolveTemplateComponents(template) {

        if (
            Array.isArray(template.components) &&
            template.components.length > 0
        ) {
            return template.components;
        }

        if (
            !template.variables ||
            Object.keys(template.variables).length === 0
        ) {
            return [];
        }

        return [
            this.#buildBodyComponent(
                template.variables
            )
        ];
    }

    /**
     * Converts an ordered variables object into a Meta body component.
     *
     * Object insertion order determines the Meta placeholder order:
     *
     * first property  -> {{1}}
     * second property -> {{2}}
     * third property  -> {{3}}
     *
     * @param {Object} variables
     * @returns {Object}
     * @private
     */
    #buildBodyComponent(variables) {

        const parameters =
            Object.values(variables).map(
                (value) => this.#buildTextParameter(value)
            );

        return {
            type: 'body',
            parameters
        };
    }

    /**
     * Builds a Meta text parameter.
     *
     * @param {string|number|boolean} value
     * @returns {Object}
     * @private
     */
    #buildTextParameter(value) {

        return {
            type: 'text',
            text: String(value)
        };
    }

    /**
     * Builds the Meta Cloud API endpoint.
     *
     * @returns {string}
     * @private
     */
    #buildEndpoint() {

        return (
            'https://graph.facebook.com/' +
            `${this.apiVersion}/` +
            `${this.phoneNumberId}/messages`
        );
    }

    /**
     * Safely reads the response body.
     *
     * @param {Response} response
     * @returns {Promise<Object|null>}
     * @private
     */
    async #readResponseBody(response) {

        const responseText = await response.text();

        if (!responseText) {
            return null;
        }

        try {
            return JSON.parse(responseText);
        } catch {
            return {
                raw: responseText
            };
        }
    }

    /**
     * Creates an error from a Meta API failure.
     *
     * @param {number} statusCode
     * @param {Object|null} responseBody
     * @returns {Error}
     * @private
     */
    #createMetaError(statusCode, responseBody) {

        const metaError =
            responseBody?.error || {};

        const code =
            metaError.code !== undefined
                ? `META_${metaError.code}`
                : 'WHATSAPP_META_API_ERROR';

        const message =
            metaError.message ||
            `Meta WhatsApp API request failed with status ${statusCode}.`;

        const retryable =
            statusCode === 408 ||
            statusCode === 429 ||
            statusCode >= 500;

        const error = this.#createTransportError({
            name: 'WhatsAppTransportApiError',
            code,
            message,
            retryable
        });

        error.statusCode = statusCode;
        error.metaErrorCode =
            metaError.code || null;
        error.metaErrorSubcode =
            metaError.error_subcode || null;
        error.metaTraceId =
            metaError.fbtrace_id || null;
        error.response = responseBody;

        return error;
    }

    /**
     * Creates a standard transport error.
     *
     * @param {Object} options
     * @param {string} options.name
     * @param {string} options.code
     * @param {string} options.message
     * @param {boolean} options.retryable
     * @param {Error} [options.cause]
     * @returns {Error}
     * @private
     */
    #createTransportError({
        name,
        code,
        message,
        retryable,
        cause
    }) {

        const error = new Error(message);

        error.name = name;
        error.code = code;
        error.retryable = retryable;
        error.isTransportError = true;

        if (cause) {
            error.cause = cause;
        }

        return error;
    }

    /**
     * Determines whether the error was created by this transport.
     *
     * @param {Error} error
     * @returns {boolean}
     * @private
     */
    #isTransportError(error) {
        return error?.isTransportError === true;
    }

}

module.exports = WhatsAppTransport;