"use strict";
module.exports = {
    initialize(context) {
        // Context gives this plugin an isolated namespace, not the whole global host.
        this.context = context;
        context.storage.set({connected:true});
        this.dispose = context.events.on("plugin:loaded",({slug}) => {
            if (slug !== context.slug) context.logger.info("Another plugin connected: " + slug);
        });
    },
    onReady() {
        // Existing LiteLoader lifecycle remains supported.
        this.context.logger.info("Typed connector ready: " + this.context.slug);
    },
    dispose() {
        this.dispose?.();
    },
};
