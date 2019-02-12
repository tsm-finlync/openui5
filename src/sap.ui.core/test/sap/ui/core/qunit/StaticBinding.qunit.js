/*global QUnit */
sap.ui.define([
	"sap/ui/model/StaticBinding",
	"sap/ui/model/CompositeBinding",
	"sap/ui/model/type/Float",
	"sap/ui/model/json/JSONModel",
	"sap/ui/base/ManagedObject"
], function(
	StaticBinding,
	CompositeBinding,
	TypeFloat,
	JSONModel,
	ManagedObject
) {
	"use strict";

	var MyObject = ManagedObject.extend("MyObject", {
		metadata: {
			properties: {
				value: {type: "string"},
				objectValue: {type: "object"},
				anyValue: {type: "any"}
			}
		}
	});

	QUnit.module("Basic functionality", {
		beforeEach: function() {
			this.static = new StaticBinding("test");
			this.staticWithFormatter = new StaticBinding("test");
			this.staticWithFormatter.setFormatter(function(sValue) {
				return "_" + sValue + "_";
			});
			this.staticWithType = new StaticBinding(123);
			this.staticWithType.setType(new TypeFloat({decimals: 2}), "string");
		},
		afterEach: function() {
			this.static = null;
			this.staticWithFormatter = null;
			this.staticWithType = null;
		}
	});

	QUnit.test("getters", function(assert) {
		assert.equal(this.static.getModel(), null, "No model");
		assert.equal(this.static.getPath(), null, "No path");
		assert.equal(this.static.getValue(), "test", "Static value");
		this.static.setValue("other");
		assert.equal(this.static.getValue(), "other", "Static value changed");
	});

	QUnit.test("getValue", function(assert) {
		assert.equal(this.static.getValue(), "test", "getValue returns static raw value");
		assert.equal(this.staticWithFormatter.getValue(), "test", "getValue returns static raw value");
		assert.equal(this.staticWithType.getValue(), 123, "getValue returns static raw value");
	});

	QUnit.test("getExternalValue", function(assert) {
		assert.equal(this.static.getExternalValue(), "test", "getExternalValue returns static value");
		assert.equal(this.staticWithFormatter.getExternalValue(), "_test_", "getExternalValue returns formatted static value");
		assert.equal(this.staticWithType.getExternalValue(), "123.00", "getExternalValue returns formatted static value");
	});

	QUnit.test("setExternalValue", function(assert) {
		this.static.setExternalValue("other");
		assert.equal(this.static.getValue(), "other", "changed static value");
		this.staticWithFormatter.setExternalValue("other");
		assert.equal(this.staticWithFormatter.getValue(), "test", "formatter prevents changing of value");
		this.staticWithType.setExternalValue("456.00");
		assert.equal(this.staticWithType.getValue(), 456, "typed value is parsed correctly");
	});

	QUnit.module("In CompositeBinding", {
		beforeEach: function() {
			this.static1 = new StaticBinding("test");
			this.static2 = new StaticBinding(123);
			this.composite = new CompositeBinding([this.static1, this.static2]);
		},
		afterEach: function() {
			this.static1 = null;
			this.static2 = null;
			this.composite = null;
		}
	});

	QUnit.test("Getter", function(assert) {
		assert.deepEqual(this.composite.getValue(), ["test", 123], "composite returns array of static values");
		assert.equal(this.composite.getExternalValue(), "test 123", "external value is space seperated");
	});

	QUnit.module("Created from binding info", {
		beforeEach: function() {
			this.model = new JSONModel({
				string: "foo"
			});
		},
		afterEach: function() {
			this.model = null;
		}
	});

	QUnit.test("Binding info as JS object, string property", function(assert) {
		var object = new MyObject({
			value: {
				value: "test"
			}
		});
		assert.ok(object.getBindingInfo("value"), "binding info is created");
		assert.equal(object.getValue(), "test", "object getter returns static value");
	});

	QUnit.test("Binding info as JS object, object property", function(assert) {
		var object = new MyObject({
			objectValue: {
				value: "test"
			}
		});
		assert.notOk(object.getBindingInfo("value"), "binding info is not created");
		assert.deepEqual(object.getObjectValue(), { value: "test" }, "object getter returns object for object properties");
	});

	QUnit.test("Binding info as JS object, any property", function(assert) {
		var object = new MyObject({
			anyValue: {
				value: "test"
			}
		});
		assert.notOk(object.getBindingInfo("value"), "binding info is not created");
		assert.deepEqual(object.getAnyValue(), { value: "test" }, "object getter returns object for object properties");
	});

	QUnit.test("Binding info as string", function(assert) {
		var object = new MyObject({
			value: "{value:123}"
		});
		assert.equal(object.getValue(), 123, "object getter returns static value");
	});

	QUnit.test("Binding info composite binding", function(assert) {
		var object = new MyObject({
			models: this.model,
			value: {
				parts:[
					{path: "/string"},
					{value: "bar"}
				]
			}
		});
		assert.equal(object.getValue(), "foo bar", "object getter returns static value");
	});

	QUnit.test("Value change", function(assert) {
		var object = new MyObject({
			value: {
				value: "test"
			}
		});
		object.setValue("control");
		assert.equal(object.getBinding("value").getValue(), "control", "Control property updates binding value");
		object.getBinding("value").setValue("binding");
		assert.equal(object.getValue(), "binding", "Binding updates control property value");
	});

});