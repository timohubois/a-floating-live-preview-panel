<?php

namespace AFloatingLivePreviewPanel;

use AFloatingLivePreviewPanel\Compatibility\Acf;
use AFloatingLivePreviewPanel\Features\Editor;
use AFloatingLivePreviewPanel\Features\Preview;

/** Connect the feature owners without registering their hooks or implementing their behavior. */
final class Plugin
{
    public function __construct(string $file)
    {
        $acf = new Acf();
        $preview = new Preview($file, $acf);
        new Editor($file, $preview, $acf);
    }
}
