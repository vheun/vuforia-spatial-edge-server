import ObjectNode from "./ObjectNode.js";

/**
 * @typedef {import("./ObjectNode.js").ObjectInterface} ObjectInterface
 * @typedef {import("./DictionaryComponentNode.js").default} ComponentNode
 * @typedef {import("./Vector3Node.js").Vector3Value} Vector3Value
 * @typedef {import("./QuaternionNode.js").QuaternionValue} QuaternionValue
 * @typedef {{getPosition: () => Vector3Value, setPosition: (position: Vector3Value) => void, getRotation: () => QuaternionValue, setRotation: (rotation: QuaternionValue) => void, getScale: () => Vector3Value, setScale: (scale: Vector3Value) => void}} EntityInterface
 */

class EntityNode extends ObjectNode {
    static TYPE = "Object.Entity";

    /**
     *
     * @param {DictionaryInterface} listener
     * @param {string} type
     */
    constructor(listener, type = EntityNode.TYPE) {
        super(listener, type);
        this.get("components").setEntityNode(this);
        if (!this.get("components").has("0")) {
            this.addComponent("0", listener.createTransform());
            this.getChanges();
        }
    }

    /**
     *
     * @returns {EntityInterface|null}
     */
    getEntity() {
        return this.getListener().getEntity();
    }

    /**
     *
     * @param {string} name
     * @returns {boolean}
     */
    hasChild(name) {
        return this.get("children").has(name);
    }

    /**
     *
     * @param {string} name
     * @param {EntityNode} entity
     */
    setChild(name, entity) {
        this.get("children").set(name, entity);
    }

    /**
     *
     * @param {number} order
     * @param {ComponentNode} component
     */
    addComponent(order, component) {
        this.get("components").set(order, component);
    }

    setPosition(x, y, z) {
        const transform = this.get("components").get(0);
        transform.setPosition({x, y, z});
    }

    setRotation(x, y, z, w) {
        const transform = this.get("components").get(0);
        transform.setRotation({x, y, z, w});
    }

    setScale(x, y, z) {
        const transform = this.get("components").get(0);
        transform.setScale({x, y, z});
    }
}

export default EntityNode;
