<?php

namespace AFloatingLivePreviewPanel;

use AFloatingLivePreviewPanel\Admin\BlockEditor;
use AFloatingLivePreviewPanel\Admin\ClassicEditor;
use AFloatingLivePreviewPanel\Admin\Panel;
use AFloatingLivePreviewPanel\Admin\RevisionBrowser;
use AFloatingLivePreviewPanel\Compatibility\Acf;
use AFloatingLivePreviewPanel\Compatibility\CoreBlocks;
use AFloatingLivePreviewPanel\Compatibility\Timber;
use AFloatingLivePreviewPanel\Preview\FrontendPreview;
use AFloatingLivePreviewPanel\Preview\LivePreview;

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
