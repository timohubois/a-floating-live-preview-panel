<?php

namespace AFloatingLivePreviewPanel;

use AFloatingLivePreviewPanel\Compatibility\Acf;
use AFloatingLivePreviewPanel\Compatibility\CoreBlocks;
use AFloatingLivePreviewPanel\Compatibility\Timber;

/** Connect the feature owners without registering their hooks or implementing their behavior. */
final class Plugin
{
    public function __construct(string $file)
    {
        $acf = new Acf();
        new CoreBlocks();
        new Timber();
        $livePreview = new LivePreview();
        $frontendPreview = new FrontendPreview($file, $livePreview);
        $panel = new Panel($file);
        new ClassicEditor($livePreview, $acf, $panel);
        new BlockEditor($livePreview, $acf, $panel);
        new RevisionBrowser($frontendPreview, $panel);
    }
}
