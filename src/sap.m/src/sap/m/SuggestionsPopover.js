/*!
 * ${copyright}
 */

sap.ui.define([
	'sap/ui/Device',
	'sap/ui/base/EventProvider',
	'sap/ui/core/InvisibleText',
	'sap/ui/core/ValueStateSupport',
	'sap/m/library',
	'sap/ui/core/library',
	'sap/m/Button',
	'sap/m/ColumnListItem',
	'sap/m/GroupHeaderListItem',
	'sap/ui/core/SeparatorItem',
	'sap/m/List',
	'sap/m/Popover',
	'sap/m/Table',
	"sap/ui/events/KeyCodes",
	"sap/m/ValueStateHeader",
	"sap/m/inputUtils/highlightDOMElements",
	"sap/m/inputUtils/scrollToItem",
	"sap/m/inputUtils/ListHelpers",
	"sap/m/inputUtils/SuggestionsPopoverDialogMixin",
	"sap/m/inputUtils/SuggestionsPopoverPopoverMixin"
], function (
	Device,
	EventProvider,
	InvisibleText,
	ValueStateSupport,
	library,
	coreLibrary,
	Button,
	ColumnListItem,
	GroupHeaderListItem,
	SeparatorItem,
	List,
	Popover,
	Table,
	KeyCodes,
	ValueStateHeader,
	highlightDOMElements,
	scrollToItem,
	ListHelpers,
	SuggestionsPopoverDialogMixin,
	SuggestionsPopoverPopoverMixin
) {
	"use strict";

	// shortcut for sap.m.ListMode
	var ListMode = library.ListMode;

	// shortcut for sap.m.ListType
	var ListType = library.ListType;

	// shortcut for sap.m.ListSeparators
	var ListSeparators = library.ListSeparators;

	var CSS_CLASS_SUGGESTIONS_POPOVER = "sapMSuggestionsPopover",
		CSS_CLASS_NO_CONTENT_PADDING = "sapUiNoContentPadding";

	// shortcut for sap.ui.core.ValueState
	var ValueState = coreLibrary.ValueState;

	/**
	 * Provides a popover that should be used with an input control which requires suggestions.
	 *
	 * @extends sap.ui.base.EventProvider
	 *
	 * @param {sap.ui.core.Control} oControl The input control that instantiates this suggestions popover
	 * @constructor
	 * @private
	 * @alias sap.m.SuggestionsPopover
	 *
	 * @author SAP SE
	 * @version ${version}
	 */
	var SuggestionsPopover = EventProvider.extend("sap.m.SuggestionsPopover", /** @lends sap.m.SuggestionsPopover.prototype */ {

		constructor: function (oInput) {
			EventProvider.apply(this, arguments);

			// stores a reference to the input control that instantiates the popover
			this._oInput = oInput;

			this._bHasTabularSuggestions = false;

			// show suggestions in a dialog on phones
			this._bUseDialog = Device.system.phone;

			// stores the selected index inside the popover list or table
			this._iPopupListSelectedIndex = -1;

			// specifies the width of the suggestion list
			this._sPopoverContentWidth = null;

			// specifies whether the suggestions highlighting is enabled
			this._bEnableHighlighting = true;

			// is the input incremental type
			this._bIsInputIncrementalType = false;

			// specifies whether autocomplete is enabled
			this._bAutocompleteEnabled = false;

			// stores currently typed value
			this._sTypedInValue = '';

			this._sOldValueState = ValueState.None;

			// adds event delegate for the arrow keys
			this._oInput.addEventDelegate({
				onsapup: function(oEvent) {
					if (!this._oInput.isComposingCharacter()){
						this._onsaparrowkey(oEvent, "up", 1);
					}
				},
				onsapdown: function(oEvent) {
					if (!this._oInput.isComposingCharacter()){
						this._onsaparrowkey(oEvent, "down", 1);
					}
				},
				onsappageup: function(oEvent) {
					this._onsaparrowkey(oEvent, "up", 5);
				},
				onsappagedown: function(oEvent) {
					this._onsaparrowkey(oEvent, "down", 5);
				},
				onsaphome: function(oEvent) {
					var iItems;
					if (this._oList) {
						iItems = this._oList.getItems().length ? this._oList.getItems().length - 1 : 0;
						this._onsaparrowkey(oEvent, "up", iItems);
					}
				},
				onsapend: function(oEvent) {
					if (this._oList) {
						this._onsaparrowkey(oEvent, "down", this._oList.getItems().length);
					}
				},
				onsapright: this._onsapright,
				onsaptabnext: this._handleValueStateLinkNav,
				onsaptabprevious: this._handleValueStateLinkNav
			}, this);

			// Apply Mixin depending on the Device
			if (Device.system.phone) {
				SuggestionsPopoverDialogMixin.apply(SuggestionsPopover.prototype);
			} else {
				SuggestionsPopoverPopoverMixin.apply(SuggestionsPopover.prototype);
			}

		},

		destroy: function () {
			this.destroyPopover();

			// CSN# 1404088/2014: list is not destroyed when it has not been attached to the popup yet
			if (this._oList) {
				this._oList.destroy();
				this._oList = null;
			}

			this._oProposedItem = null;
			this._oInputDelegate = null;
			this._oValueStateHeader = null; // The value state header is destroyed by the Popover

			if (this._oPickerValueStateText) {
				this._oPickerValueStateText.destroy();
				this._oPickerValueStateText = null;
			}
		}
	});

	/**
	 * Map of event names and ids, that are provided by this class.
	 *
	 * @private
	 * @static
	 */
	SuggestionsPopover.M_EVENTS = {
		SELECTION_CHANGE : "selectionChange"
	};

	/**
	 * Checks if the suggestions popover is currently opened.
	 *
	 * @return {boolean} whether the suggestions popover is currently opened
	 * @public
	 */
	SuggestionsPopover.prototype.isOpen = function () {
		var oPopover = this.getPopover();
		return oPopover && oPopover.isOpen();
	};

	SuggestionsPopover.prototype.setPopover = function (oPopoverOrDialog) {
		this._oPopover = oPopoverOrDialog;
	};

	SuggestionsPopover.prototype.getPopover = function () {
		return this._oPopover;
	};

	SuggestionsPopover.prototype.destroyPopover = function () {
		if (this._oPopover) {
			this._oPopover.destroy();
		}
		this._oPopover = null;
	};

	/**
	 * Sets a function, that returns the labels associated with the parent input.
	 *
	 * @public
	 */
	SuggestionsPopover.prototype.setInputLabels = function (fnGetLabels) {
		this._fnInputLabels = fnGetLabels;
	};

	/**
	 * Helper function that creates suggestion popup.
	 */
	SuggestionsPopover.prototype._createSuggestionPopup = function (mOptions) {
		var oPopover,
			oInput = this._oInput;

		mOptions = mOptions || [];
		oPopover = this.createPopover(oInput, this._oPopupInput, mOptions);

		this.setPopover(oPopover);
		this._registerAutocomplete();
		oPopover.addStyleClass(CSS_CLASS_SUGGESTIONS_POPOVER);
		oPopover.addStyleClass(CSS_CLASS_NO_CONTENT_PADDING);
		oPopover.addAriaLabelledBy(InvisibleText.getStaticId("sap.m", "INPUT_AVALIABLE_VALUES"));

		if (this._oList) {
			this.addContent(this._oList);
		}
	};

	/**
	 * Helper function that creates content for the suggestion popup.
	 *
	 * @param {boolean | null } bTabular Determines whether the popup content is a table or a list.
	 */
	SuggestionsPopover.prototype._createSuggestionPopupContent = function (bTabular) {
		var oInput = this._oInput,
			oPopover = this.getPopover();

		this._bHasTabularSuggestions = bTabular;

		if (!bTabular) {
			this._oList = new List(oInput.getId() + "-popup-list", {
				showNoData : false,
				mode : ListMode.SingleSelectMaster,
				rememberSelections : false,
				width: "100%",
				showSeparators: ListSeparators.None,
				busyIndicatorDelay: 0
			});

			this._oList.addEventDelegate({
				onAfterRendering: function () {
					var aListItemsDomRef, sInputValue;

					if (!this._bEnableHighlighting) {
						return;
					}

					aListItemsDomRef = this._oList.$().find('.sapMSLIInfo, .sapMSLITitleOnly');
					sInputValue = (this._sTypedInValue || this._oInput.getValue()).toLowerCase();

					highlightDOMElements(aListItemsDomRef, sInputValue);
				}.bind(this)
			});

		} else {
			// tabular suggestions
			this._oList = this._oInput._getSuggestionsTable();
		}

		if (oPopover) {
			if (this._bUseDialog) {
				// this._oList needs to be manually rendered otherwise it triggers a rerendering of the whole
				// dialog and may close the opened on screen keyboard
				oPopover.addAggregation("content", this._oList, true);
				var oRenderTarget = oPopover.$("scrollCont")[0];
				if (oRenderTarget) {
					var rm = sap.ui.getCore().createRenderManager();
					rm.renderControl(this._oList);
					rm.flush(oRenderTarget);
					rm.destroy();
				}
			} else {
				this.addContent(this._oList);
			}
		}
	};

	SuggestionsPopover.prototype._getValueStateHeader = function () {
		var oPopover;
		if (!this._oValueStateHeader) {
			this._oValueStateHeader = new ValueStateHeader();
			oPopover = this.getPopover();

			if (oPopover.isA("sap.m.Popover")) {
				// when we are using the Popover the value state header is shown in the header of the Popover
				oPopover.setCustomHeader(this._oValueStateHeader);
			} else {
				// on mobile the content is used and sticky position is set on the header
				oPopover.insertContent(this._oValueStateHeader, 0);
			}

			this._oValueStateHeader.setPopup(oPopover);
		}

		return this._oValueStateHeader;
	};

	/**
	 * Helper function that destroys suggestion popup.
	 */
	SuggestionsPopover.prototype._destroySuggestionPopup = function () {
		// if the table is not removed before destroying the popup the table is also destroyed (table needs to stay because we forward the column and row aggregations to the table directly, they would be destroyed as well)
		if (this.getPopover() && this._oList instanceof Table) {
			this.getPopover().removeAllContent();
		}

		this.destroyPopover();

		// CSN# 1404088/2014: list is not destroyed when it has not been attached to the popup yet
		if (this._oList instanceof List) {
			this._oList.destroy();
			this._oList = null;
		}

		if (this._oPickerValueStateText) {
			this._oPickerValueStateText.destroy();
			this._oPickerValueStateText = null;
		}

		if (this._oValueStateHeader) {
			this._oValueStateHeader.destroy();
			this._oValueStateHeader = null;
		}

		this._getInput().removeEventDelegate(this._oInputDelegate, this);
	};

	/**
	 * Handles value state link navigation
	 *
	 * @param {jQuery.Event} oEvent The event object
	 * @private
	 */
	SuggestionsPopover.prototype._handleValueStateLinkNav = function(oEvent) {
		// The Input & MultiInput use a boolean flag to indicate whether or not the
		// visual focus is on the ValueStateHeader, the ComboBox has a private property for that
		this.bMessageValueStateActive = this._oInput.getFormattedTextFocused ? this._oInput.getFormattedTextFocused() : this.bMessageValueStateActive;

		if ((!this.bMessageValueStateActive || !this.getValueStateLinks().length) || (this.bMessageValueStateActive && document.activeElement.tagName === "A")) {
			return;
		}

		var aValueStateLinks = this.getValueStateLinks(),
			oLastValueStateLink = aValueStateLinks[aValueStateLinks.length - 1];

		// Prevent from closing right away
		oEvent.preventDefault();
		this._iPopupListSelectedIndex = -1;

		// Move the real focus on the first link and remove the pseudo one from the
		// Formatted Text value state header
		aValueStateLinks[0].focus();
		this._getValueStateHeader().removeStyleClass("sapMPseudoFocus");

		aValueStateLinks.forEach(function(oLink) {
			oLink.addDelegate({
				onsapup: function(oEvent) {
					this._oInput.getFocusDomRef().focus();
					this._onsaparrowkey(oEvent, "up", 1);
				},
				onsapdown: function(oEvent) {
					this._oInput.getFocusDomRef().focus();
					this._onsaparrowkey(oEvent, "down", 1);
				}
			}, this);
		}, this);

		// If saptabnext is fired on the last link of the value state - close the control
		oLastValueStateLink.addDelegate({
			onsaptabnext: function(oEvent) {
				this.bMessageValueStateActive = false;
				this._oInput.onsapfocusleave(oEvent);
				this.getPopover().close();

				/* By default the value state message popup is opened when the suggestion popover
				is closed. We don't want that in this case because the focus will move on to the next object.
				The popup must be closed with setTimeout() because it is opened with one. */
				setTimeout(function() {
					this._oInput.closeValueStateMessage();
				}.bind(this), 0);
			}
		}, this);
		// If saptabprevious is fired on the first link move real focus on the input and the visual one back to the value state header
		aValueStateLinks[0].addDelegate({
			onsaptabprevious: function(oEvent) {
				oEvent.preventDefault();
				this._oInput.getFocusDomRef().focus();
				this._getValueStateHeader().addStyleClass("sapMPseudoFocus");
				this._oInput.removeStyleClass("sapMFocus");
			}
		}, this);
	};

	/**
	 * Keyboard handler helper.
	 *
	 * @private
	 * @param {jQuery.Event} oEvent Arrow key event.
	 * @param {string} sDir Arrow direction.
	 * @param {int} iItems Items to be changed.
	 */
	SuggestionsPopover.prototype._onsaparrowkey = function(oEvent, sDir, iItems) {
		var oInput = this._oInput,
			oListItem,
			oPopover = this.getPopover(),
			oInnerRef = oInput.$("inner");

		if (oEvent.isMarked()) {
			return;
		}

		if (!oInput.getEnabled() || !oInput.getEditable()) {
			return;
		}
		if (sDir !== "up" && sDir !== "down") {
			return;
		}
		if (this._bIsInputIncrementalType) {
			oEvent.setMarked();
		}

		if (!oPopover || !oPopover.isOpen()) {
			return;
		}

		oEvent.preventDefault();
		oEvent.stopPropagation();

		var bFirst = false,
			oList = this._oList,
			aListItems = oList.getItems(),
			oSelectedItem = oList.getSelectedItem(),
			iSelectedIndex = this._iPopupListSelectedIndex,
			sNewValue,
			oValueStateHeader = this._getValueStateHeader(),
			oFormattedText = oValueStateHeader.getFormattedText(),
			oPseudoFocusedElement = Device.browser.msie ? oFormattedText : oValueStateHeader,
			iOldIndex = iSelectedIndex;

		if (sDir == "down" && iSelectedIndex === aListItems.length - 1) {
			//if key is 'down' and selected Item is last -> do nothing
			return;
		}

		// If Value State Header contains links and it is focused - move the visual focus to the last item when on sapend
		if (this.getValueStateLinks().length && this.bMessageValueStateActive && oEvent.type === "sapend") {
			oPseudoFocusedElement.removeStyleClass("sapMPseudoFocus");
			this._oList.addStyleClass("sapMListFocus");
			// If the visual focus is on the value state header then the last selected suggested item was the first one
			iOldIndex = 0;
			iSelectedIndex = aListItems.length - 1;
			aListItems[iSelectedIndex].addStyleClass("sapMLIBFocused");
			this.bMessageValueStateActive = false;
		}

		var iStopIndex;
		if (iItems > 1) {
			// if iItems would go over the borders, search for valid item in other direction
			if (sDir == "down" && iSelectedIndex + iItems >= aListItems.length) {
				sDir = "up";
				iItems = 1;
				aListItems[iSelectedIndex].setSelected(false);
				aListItems[iSelectedIndex].removeStyleClass("sapMLIBFocused");
				iStopIndex = iSelectedIndex;
				iSelectedIndex = aListItems.length - 1;
				bFirst = true;
			} else if (sDir == "up" && iSelectedIndex - iItems < 0 && iSelectedIndex >= 0) {
				sDir = "down";
				iItems = 1;
				aListItems[iSelectedIndex].setSelected(false);
				aListItems[iSelectedIndex].removeStyleClass("sapMLIBFocused");
				iStopIndex = iSelectedIndex;
				iSelectedIndex = 0;
				bFirst = true;
			}
		}

		oInput.removeStyleClass("sapMFocus");
		this._oList.addStyleClass("sapMListFocus");

		// always select the first item from top when nothing is selected so far
		if (iSelectedIndex === -1) {
			iSelectedIndex = 0;
			if (this._isSuggestionItemSelectable(aListItems[iSelectedIndex])) {
				// if first item is visible, don't go into while loop
				iOldIndex = iSelectedIndex;
				bFirst = true;
			} else {
				// detect first visible item with while loop
				sDir = "down";
			}
		}

		if (sDir === "down") {
			while (iSelectedIndex < aListItems.length - 1 && (!bFirst || !this._isSuggestionItemSelectable(aListItems[iSelectedIndex]))) {
				aListItems[iSelectedIndex].setSelected(false);
				aListItems[iSelectedIndex].removeStyleClass("sapMLIBFocused");
				iSelectedIndex = iSelectedIndex + iItems;
				bFirst = true;
				iItems = 1; // if wanted item is not selectable just search the next one
				if (iStopIndex === iSelectedIndex) {
					break;
				}
			}
		} else {
			while (iSelectedIndex > 0 && (!bFirst || !aListItems[iSelectedIndex].getVisible() || !this._isSuggestionItemSelectable(aListItems[iSelectedIndex]))) {
				aListItems[iSelectedIndex].setSelected(false);
				aListItems[iSelectedIndex].removeStyleClass("sapMLIBFocused");
				iSelectedIndex = iSelectedIndex - iItems;
				bFirst = true;
				iItems = 1; // if wanted item is not selectable just search the next one
				if (iStopIndex === iSelectedIndex) {
					break;
				}
			}
		}

		if ((this.getValueStateLinks().length && !this.bMessageValueStateActive && oEvent.type !== "sapend") &&
			((sDir === "up" && (!this._isSuggestionItemSelectable(aListItems[iSelectedIndex]) || iOldIndex === 0)) || oEvent.type === "saphome")) {
			/* If there is a formatted text with link in value state header and the "focused" item
			is the first selectable item (if no further visible item can be found) - move the focus to the value state header on arrow up.
			In case of saphome move the focus to the Value State Header, no matter the position of the old selected item */
			oPseudoFocusedElement.addStyleClass(("sapMPseudoFocus"));
			this._oList.removeStyleClass("sapMListFocus");
			oInnerRef.attr("aria-activedescendant", oFormattedText.getId());
			this.bMessageValueStateActive = true;
			this._iPopupListSelectedIndex = -1;
			scrollToItem(aListItems[0], this.getPopover());
			return;
		}

		// Remove the visual focus of the Value State Header, if links are present and arrow up/down is pressed
		if ((this.getValueStateLinks().length && this.bMessageValueStateActive) && (sDir === "up" && iSelectedIndex === 0 || sDir === "down")) {
			oPseudoFocusedElement.removeStyleClass("sapMPseudoFocus");
			this._oList.addStyleClass("sapMListFocus");
			this.bMessageValueStateActive = false;
		}

		if (!this._isSuggestionItemSelectable(aListItems[iSelectedIndex])) {
			// If no further visible item can be found and there are no links in the value state header -> do nothing (e.g. set the old item as selected again)
			if (iOldIndex >= 0) {
				aListItems[iOldIndex].setSelected(true).updateAccessibilityState();
				oInnerRef.attr("aria-activedescendant", aListItems[iOldIndex].getId());
				aListItems[iOldIndex].addStyleClass("sapMLIBFocused");
			}
			return;
		} else {
			oListItem = aListItems[iSelectedIndex];
			oListItem.setSelected(true).updateAccessibilityState();
			oListItem.addStyleClass("sapMLIBFocused");

			oInnerRef.attr("aria-activedescendant", aListItems[iSelectedIndex].getId());
		}

		if (Device.system.desktop) {
			scrollToItem(aListItems[iSelectedIndex], this.getPopover());
		}

		// make sure the value doesn't exceed the maxLength
		this._oLastSelectedHeader && this._oLastSelectedHeader.removeStyleClass("sapMInputFocusedHeaderGroup");
		if (ColumnListItem && aListItems[iSelectedIndex] instanceof ColumnListItem) {
			// for tabular suggestions we call a result filter function
			sNewValue = oInput._getInputValue(oInput._fnRowResultFilter(aListItems[iSelectedIndex]));
		} else {
			if (aListItems[iSelectedIndex].isA("sap.m.GroupHeaderListItem")) {
				sNewValue = "";
				aListItems[iSelectedIndex].addStyleClass("sapMInputFocusedHeaderGroup");
				oSelectedItem && oSelectedItem.setSelected(false);
				this._oLastSelectedHeader = aListItems[iSelectedIndex];
			} else {
				// otherwise we use the item title
				sNewValue = oInput._getInputValue(aListItems[iSelectedIndex].getTitle());
			}
		}

		this._iPopupListSelectedIndex = iSelectedIndex;

		this._bSuggestionItemChanged = true;

		this.fireEvent(SuggestionsPopover.M_EVENTS.SELECTION_CHANGE, {newValue: sNewValue});
	};

	/**
	 * Helper method for keyboard navigation in suggestion items.
	 *
	 * @returns {array} Links in value state <code>sap.m.FormattedText</code> message.
	 * @private
	 */
	SuggestionsPopover.prototype.getValueStateLinks = function() {
		var oHeaderCache = this._getValueStateHeader(),
			oFormattedText = oHeaderCache && typeof oHeaderCache.getFormattedText === "function" && oHeaderCache.getFormattedText(),
			aLinks = oFormattedText && typeof oFormattedText.getControls === "function" && oFormattedText.getControls();

		return aLinks || [];
	};

	/**
	 * Helper method for keyboard navigation in suggestion items.
	 *
	 * @private
	 * @param {sap.ui.core.Item} oItem Suggestion item.
	 * @returns {boolean} Is the suggestion item selectable.
	 */
	SuggestionsPopover.prototype._isSuggestionItemSelectable = function(oItem) {
		// CSN# 1390866/2014: The default for ListItemBase type is "Inactive", therefore disabled entries are only supported for single and two-value suggestions
		// for tabular suggestions: only check visible
		// for two-value and single suggestions: check also if item is not inactive
		var bSelectionAllowed = this._bHasTabularSuggestions
			|| oItem.getType() !== ListType.Inactive
			|| oItem.isA("sap.m.GroupHeaderListItem");

		return oItem.getVisible() && bSelectionAllowed;
	};

	/**
	 * Registers event handlers required for
	 * the autocomplete functionality.
	 *
	 * @private
	 */
	SuggestionsPopover.prototype._registerAutocomplete = function () {
		var oPopover = this.getPopover(),
			oUsedInput = this._getInput(),
			bUseDialog = this._bUseDialog;

		if (bUseDialog) {
			oPopover.addEventDelegate({
				ontap: function () {
					// used when clicking outside the suggestions list
					if (!this._bSuggestionItemTapped && this._sProposedItemText) {
						oUsedInput.setValue(this._sProposedItemText);
						this._sProposedItemText = null;
					}
				}
			}, this);
		} else {
			oPopover.attachAfterOpen(this._handleTypeAhead, this);
		}

		oPopover.attachAfterOpen(this._setSelectedSuggestionItem, this);
		oPopover.attachAfterClose(this._finalizeAutocomplete, this);

		this._oInputDelegate = {
			onkeydown: function (oEvent) {
				// disable the typeahead feature for android devices due to an issue on android soft keyboard, which always returns keyCode 229
				this._bDoTypeAhead = !Device.os.android && this._bAutocompleteEnabled && (oEvent.which !== KeyCodes.BACKSPACE) && (oEvent.which !== KeyCodes.DELETE);
			},
			oninput: this._handleTypeAhead
		};

		oUsedInput.addEventDelegate(this._oInputDelegate, this);
	};

	/**
	 * Autocompletes input.
	 *
	 * @private
	 */
	SuggestionsPopover.prototype._handleTypeAhead = function() {
		var oInput = this._getInput(),
			sValue = oInput.getValue();

		this._oProposedItem = null;
		this._sProposedItemText = null;
		this._sTypedInValue = sValue;

		if (!this._bDoTypeAhead || sValue === "") {
			return;
		}

		if (!this.getPopover().isOpen() || sValue.length < this._oInput.getStartSuggestion()) {
			return;
		}

		if (document.activeElement !== oInput.getFocusDomRef()) {
			return;
		}

		var sValueLowerCase = sValue.toLowerCase(),
			aItems = this._bHasTabularSuggestions ? this._oInput.getSuggestionRows() : ListHelpers.getEnabledItems(this._oInput.getSuggestionItems()),
			iLength,
			sNewValue,
			sItemText,
			i;

		aItems = aItems.filter(function(oItem){
			return !(oItem.isA("sap.ui.core.SeparatorItem") || oItem.isA("sap.m.GroupHeaderListItem"));
		});

		iLength = aItems.length;

		for (i = 0; i < iLength; i++) {
			sItemText =  this._bHasTabularSuggestions ? this._oInput._fnRowResultFilter(aItems[i]) : aItems[i].getText();

			if (sItemText.toLowerCase().indexOf(sValueLowerCase) === 0) { // startsWith
				this._oProposedItem = aItems[i];
				sNewValue = sItemText;
				break;
			}
		}

		this._sProposedItemText = sNewValue;

		if (sNewValue) {
			sNewValue = this._formatTypedAheadValue(sNewValue);

			if (!oInput.isComposingCharacter()) {
				oInput.updateDomValue(sNewValue);
			}

			if (Device.system.desktop) {
				oInput.selectText(sValue.length, sNewValue.length);
			} else {
				// needed when user types too fast
				setTimeout(function () {
					oInput.selectText(sValue.length, sNewValue.length);
				}, 0);
			}
		}
	};

	/**
	 * Sets matched selected item in the suggestion popover
	 *
	 * @private
	 */
	SuggestionsPopover.prototype._setSelectedSuggestionItem = function () {
		var aItems = this._oInput.getItems ?  this._oInput.getItems() : this._oInput.getSuggestionItems(),
			aListItems, oItem;

		if (!this._oList) {
			return;
		}

		aListItems = this._oList.getItems();
		for (var i = 0; i < aListItems.length; i++) {
			// for tabular suggestions the proposed item should be one of the filtered items,
			// otherwise the proposed item should be an existing list item
			oItem = ListHelpers.getItemByListItem(aItems, aListItems[i]) || aListItems[i];
			if (oItem === this._oProposedItem) {
				aListItems[i].setSelected(true);
				break;
			}
		}
	};

	/**
	 * Returns the Input control
	 * depending on the device (mobile or desktop).
	 *
	 * @private
	 * @returns {sap.m.Input} Reference to the corresponding control
	 */
	SuggestionsPopover.prototype._getInput = function () {
		return this._bUseDialog ? this._oPopupInput : this._oInput;
	};

	/**
	 * Sets the selected item (if it exists) from the autocomplete when pressing Enter.
	 *
	 * @private
	 */
	SuggestionsPopover.prototype._finalizeAutocomplete = function () {
		if (this._oInput.isComposingCharacter()) {
			return;
		}

		if (!this._bAutocompleteEnabled) {
			return;
		}

		if (!this._bSuggestionItemTapped && !this._bSuggestionItemChanged && this._oProposedItem) {
			if (this._bHasTabularSuggestions) {
				this._oInput.setSelectionRow(this._oProposedItem, true);
			} else {
				this._oInput.setSelectionItem(this._oProposedItem, true);
			}
		}

		if (this._oProposedItem && document.activeElement === this._oInput.getFocusDomRef()) {
			var iLength = this._oInput.getValue().length;
			this._oInput.selectText(iLength, iLength);
		}

		this._resetTypeAhead();
	};

	/**
	 * Resets properties, that are related to autocomplete, to their initial state.
	 *
	 * @private
	 */
	SuggestionsPopover.prototype._resetTypeAhead = function () {
		this._oProposedItem = null;
		this._sProposedItemText = null;
		this._sTypedInValue = '';
		this._bSuggestionItemTapped = false;
		this._bSuggestionItemChanged = false;
	};

	/**
	 * Formats the input value
	 * in a way that it preserves character casings typed by the user
	 * and appends suggested value with casings as they are in the
	 * corresponding suggestion item.
	 *
	 * @private
	 * @param {string} sNewValue Value which will be formatted.
	 * @returns {string} The new formatted value.
	 */
	SuggestionsPopover.prototype._formatTypedAheadValue = function (sNewValue) {
		return this._sTypedInValue.concat(sNewValue.substring(this._sTypedInValue.length, sNewValue.length));
	};

	/**
	 * Event delegate for right arrow key press
	 * on the input control.
	 *
	 * @private
	 */
	SuggestionsPopover.prototype._onsapright = function () {
		var oInput = this._oInput,
			sValue = oInput.getValue();

		if (!this._bAutocompleteEnabled) {
			return;
		}

		if (this._sTypedInValue !== sValue) {
			this._sTypedInValue = sValue;

			oInput.fireLiveChange({
				value: sValue,
				// backwards compatibility
				newValue: sValue
			});
		}
	};

	/**
	 *
	 * Updates the value state displayed in the popover.
	 *
	 * @param {string} sValueState Value state of the control
	 * @param {(string|object)} vValueStateText Value state message text of the control.
	 * @param {boolean} bShowValueStateMessage Whether or not a value state message should be displayed.
	 * @returns {sap.m.SuggestionsPopover} <code>this</code> to allow method chaining
	 *
	 * @private
	 */
	SuggestionsPopover.prototype.updateValueState = function(sValueState, vValueStateText, bShowValueStateMessage) {
		var bShow = bShowValueStateMessage && sValueState !== ValueState.None;
		vValueStateText = vValueStateText || ValueStateSupport.getAdditionalText(sValueState);
		if (!this.getPopover()) {
			return this;
		}

		if (this._oPopupInput) {
			this._oPopupInput.setValueState(sValueState);
		}

		this._getValueStateHeader().setValueState(sValueState);

		// Set the value state text
		if (this._oValueStateHeader && typeof vValueStateText === "string") {
			this._oValueStateHeader.setText(vValueStateText);
		} else if (this._oValueStateHeader && typeof vValueStateText === "object") {
			this._oValueStateHeader.setFormattedText(vValueStateText);
		}

		// adjust ValueStateHeader visibility
		if (this._oValueStateHeader) {
			this._oValueStateHeader.setVisible(bShow);
		}

		this._alignValueStateStyles(sValueState);

		return this;
	};

	/**
	 * Aligns the value state styles
	 *
	 * @private
	 */
	SuggestionsPopover.prototype._alignValueStateStyles = function(sValueState) {
		var sPickerWithState = CSS_CLASS_SUGGESTIONS_POPOVER + "ValueState",
			sOldCssClass = CSS_CLASS_SUGGESTIONS_POPOVER + this._sOldValueState + "State",
			sCssClass = CSS_CLASS_SUGGESTIONS_POPOVER + sValueState + "State",
			oPopover = this.getPopover();

		oPopover.addStyleClass(sPickerWithState);
		oPopover.removeStyleClass(sOldCssClass);
		oPopover.addStyleClass(sCssClass);

		this._sOldValueState = sValueState;
	};

	/**
	 * Adds flex content.
	 *
	 * @param {sap.m.Control} oControl Control to be added
	 * @protected
	 */
	SuggestionsPopover.prototype.addContent = function(oControl) {
		this.getPopover().addContent(oControl);
	};

	/**
	 * =================== Interfaces ===================
	 *
	 * These are the common interfaces between the Dialog and the Popover.
	 * Mixins should overwrite those methods if they need that functionality.
	 */

	/**
	 * Returns a reference to the title inside the dialog
	 *
	 * @return {sap.m.Title} The title
	 * @public
	 */
	SuggestionsPopover.prototype.getPickerTitle = function () {
		return null;
	};

	/**
	 * Returns a reference to the OK button inside the dialog
	 *
	 * @return {sap.m.Button|null} The OK button
	 * @public
	 */
	SuggestionsPopover.prototype.getOkButton = function () {
		return null;
	};

	/**
	 * Returns a reference to the cancel button inside the dialog
	 *
	 * @return {sap.m.Button|null} The cancel button
	 * @public
	 */
	SuggestionsPopover.prototype.getCancelButton = function () {
		return null;
	};

	/**
	 * Returns a reference a button inside the dialog, associated with filtering actions in multi selection scenarios
	 *
	 * @return {sap.m.Button|null} The button
	 * @public
	 */
	SuggestionsPopover.prototype.getFilterSelectedButton = function () {
		return null;
	};

	SuggestionsPopover.prototype.setOkPressHandler = function () {
		return null;
	};

	SuggestionsPopover.prototype.setCancelPressHandler = function () {
		return null;
	};

	SuggestionsPopover.prototype.setShowSelectedPressHandler = function () {
		return null;
	};

	SuggestionsPopover.prototype.resizePopup = function () {
	};

	return SuggestionsPopover;
});
