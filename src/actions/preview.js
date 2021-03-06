/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// @flow
import { isConsole } from "../utils/preview";
import { findBestMatchExpression } from "../utils/ast";
import { isGeneratedId } from "devtools-source-map";
import { PROMISE } from "./utils/middleware/promise";
import { getExpressionFromCoords } from "../utils/editor/get-expression";

import {
  getPreview,
  isLineInScope,
  isSelectedFrameVisible,
  getSelectedSource,
  getSelectedFrame,
  getSymbols,
  getCanRewind
} from "../selectors";

import { getMappedExpression } from "./expressions";
import { getExtra } from "./pause";

import type { Action, ThunkArgs } from "./types";
import type { ColumnPosition } from "../types";
import type { AstLocation } from "../workers/parser";

function findExpressionMatch(state, codeMirror, tokenPos) {
  const source = getSelectedSource(state);
  const symbols = getSymbols(state, source);

  let match;
  if (!symbols || symbols.loading) {
    match = getExpressionFromCoords(codeMirror, tokenPos);
  } else {
    match = findBestMatchExpression(symbols, tokenPos);
  }
  return match;
}

export function updatePreview(
  target: HTMLElement,
  tokenPos: Object,
  codeMirror: any
) {
  return ({ dispatch, getState, client, sourceMaps }: ThunkArgs) => {
    const cursorPos = target.getBoundingClientRect();

    if (
      getCanRewind(getState()) ||
      !isSelectedFrameVisible(getState()) ||
      !isLineInScope(getState(), tokenPos.line)
    ) {
      return;
    }

    const match = findExpressionMatch(getState(), codeMirror, tokenPos);
    if (!match) {
      return;
    }

    const { expression, location } = match;

    if (isConsole(expression)) {
      return;
    }

    dispatch(setPreview(expression, location, tokenPos, cursorPos));
  };
}

export function setPreview(
  expression: string,
  location: AstLocation,
  tokenPos: ColumnPosition,
  cursorPos: ClientRect
) {
  return async ({ dispatch, getState, client, sourceMaps }: ThunkArgs) => {
    await dispatch(
      ({
        type: "SET_PREVIEW",
        [PROMISE]: (async function() {
          const source = getSelectedSource(getState());
          const sourceId = source.id;
          const selectedFrame = getSelectedFrame(getState());

          if (location && !isGeneratedId(sourceId)) {
            expression = await dispatch(getMappedExpression(expression));
          }

          if (!selectedFrame) {
            return;
          }

          const { result } = await client.evaluateInFrame(
            expression,
            selectedFrame.id
          );

          if (result === undefined) {
            return;
          }

          const extra = await dispatch(getExtra(expression, result));

          return {
            expression,
            result,
            location,
            tokenPos,
            cursorPos,
            extra
          };
        })()
      }: Action)
    );
  };
}

export function clearPreview() {
  return ({ dispatch, getState, client }: ThunkArgs) => {
    const currentSelection = getPreview(getState());
    if (!currentSelection) {
      return;
    }

    return dispatch(
      ({
        type: "CLEAR_SELECTION"
      }: Action)
    );
  };
}
