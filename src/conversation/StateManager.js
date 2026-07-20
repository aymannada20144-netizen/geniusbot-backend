'use strict';

/**
 * StateManager
 *
 * مسؤول فقط عن:
 * - إنشاء الحالة الأولية للمحادثة.
 * - توحيد أي حالة قادمة من قاعدة البيانات أو خدمات المحادثة.
 *
 * لا يحتوي على:
 * - SQL.
 * - منطق حجز.
 * - توجيه النوايا.
 * - استدعاءات AI.
 */
class StateManager {
  /**
   * ينشئ الحالة الأولية الثابتة لأي محادثة جديدة.
   *
   * @returns {{
   *   current: string|null,
   *   activeFlow: string|null,
   *   pendingConfirmation: boolean,
   *   lastIntent: string|null,
   *   status: string,
   *   data: Object
   * }}
   */
  createInitialState() {
    return {
      current: null,
      activeFlow: null,
      pendingConfirmation: false,
      lastIntent: null,
      status: 'open',
      data: {},
    };
  }

  /**
   * يوحد الحالة داخل عقد ثابت.
   *
   * يدعم مؤقتًا بعض أسماء الحقول القديمة حتى لا ينكسر
   * الربط مع البيانات الموجودة، لكن المخرجات دائمًا موحدة.
   *
   * @param {Object|null|undefined} state
   *
   * @returns {{
   *   current: string|null,
   *   activeFlow: string|null,
   *   pendingConfirmation: boolean,
   *   lastIntent: string|null,
   *   status: string,
   *   data: Object
   * }}
   */
  normalize(state) {
    if (
      !state ||
      typeof state !== 'object' ||
      Array.isArray(state)
    ) {
      return this.createInitialState();
    }

    const initialState = this.createInitialState();

    return {
      current: this.#normalizeNullableString(
        state.current ??
        state.currentState ??
        state.current_state
      ),

      activeFlow: this.#normalizeNullableString(
        state.activeFlow ??
        state.active_flow
      ),

      pendingConfirmation:
        this.#normalizeBoolean(
          state.pendingConfirmation ??
          state.pending_confirmation,
          initialState.pendingConfirmation
        ),

      lastIntent: this.#normalizeNullableString(
        state.lastIntent ??
        state.last_intent
      ),

      status: this.#normalizeStatus(
        state.status,
        initialState.status
      ),

      data: this.#normalizeObject(
        state.data ??
        state.stateData ??
        state.state_data ??
        state.statePayload ??
        state.state_payload
      ),
    };
  }

  /**
   * @private
   */
  #normalizeNullableString(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalizedValue = value.trim();

    return normalizedValue || null;
  }

  /**
   * @private
   */
  #normalizeBoolean(value, fallback) {
    if (typeof value === 'boolean') {
      return value;
    }

    return fallback;
  }

  /**
   * حالة المحادثة المعتمدة في الطبقة الحالية:
   * open / closed / archived
   *
   * @private
   */
  #normalizeStatus(value, fallback) {
    if (typeof value !== 'string') {
      return fallback;
    }

    const normalizedStatus = value
      .trim()
      .toLowerCase();

    const allowedStatuses = new Set([
      'open',
      'closed',
      'archived',
    ]);

    return allowedStatuses.has(normalizedStatus)
      ? normalizedStatus
      : fallback;
  }

  /**
   * @private
   */
  #normalizeObject(value) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return {};
    }

    return { ...value };
  }
}

module.exports = StateManager;