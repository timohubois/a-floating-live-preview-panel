<?php

namespace AFloatingLivePreviewPanel;

use AFloatingLivePreviewPanel\Compatibility\Acf;
use AFloatingLivePreviewPanel\Compatibility\Editor;
use AFloatingLivePreviewPanel\Features\Panel;
use AFloatingLivePreviewPanel\Features\Preview;

/** Connect the feature owners without registering their hooks or implementing their behavior. */
final class Plugin
{
    public function __construct(string $file)
    {
        $acf = new Acf();
        $preview = new Preview($file, $acf);
        $panel = new Panel($file);
        new Editor($file, $preview, $acf, $panel);
    }
}
